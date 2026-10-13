/* WEB-345 — /api/pubimg: the public portfolio image primitive. Membership is
 * the boundary (resolve re-runs on every request, so curate-out/unlist/
 * unpublish 404 immediately), signatures are HMAC over asset+expiry, and
 * the public payload carries signed pubimg URLs instead of R2 keys. */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { pubimgCacheKey, pubimgLink, purgePubimgCache, verifyPubimgSig } from "@/lib/pubimg-link";
import {
  addAssetsToCollection,
  createCollection,
  getOrCreatePortfolioSite,
  getPublishedPortfolio,
  removeAssetFromCollection,
  resolvePublicPortfolioImage,
  updateCollection,
  updatePortfolioSite,
} from "@/lib/repos/portfolio";
import { resetDb } from "../helpers/db";
import { seedAsset, seedProject, seedStudio } from "../helpers/seed";

beforeEach(async () => {
  await resetDb();
});

async function seedImages(org: string, n: number) {
  const project = await seedProject(org);
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = await seedAsset({ organizationId: org, projectId: project, kind: "image" });
    await getDb()
      .update(schema.assets)
      .set({ previewKey: `${org}/${id}/preview.jpg` })
      .where(eq(schema.assets.id, id));
    ids.push(id);
  }
  return ids;
}

async function publishedSiteWithImage() {
  const studio = await seedStudio();
  const site = await getOrCreatePortfolioSite(studio.organizationId, "Showcase");
  const ids = await seedImages(studio.organizationId, 2);
  const col = await createCollection(studio.organizationId, { title: "Best" }, null);
  if (!col.ok) throw new Error("seed collection failed");
  const add = await addAssetsToCollection(studio.organizationId, col.collection.id, ids, null);
  if (!add.ok) throw new Error("seed add failed");
  const pub = await updatePortfolioSite(studio.organizationId, { status: "published" });
  if (!pub.ok) throw new Error("seed publish failed");
  return { studio, site, collection: col.collection, ids };
}

describe("pubimg signatures (lib/pubimg-link)", () => {
  it("mints /api/pubimg URLs that verify, and rejects tamper/expiry/wrong-asset (AC2)", async () => {
    const link = await pubimgLink("asset-1");
    expect(link).toMatch(/^\/api\/pubimg\/asset-1\?e=\d+&h=[a-f0-9]{64}$/);
    const url = new URL(link, "https://x.test");
    expect(await verifyPubimgSig("asset-1", url.searchParams.get("e")!, url.searchParams.get("h")!)).toBe(true);

    // Tampered sig / asset swap / garbage exp → false.
    expect(await verifyPubimgSig("asset-1", url.searchParams.get("e")!, "0".repeat(64))).toBe(false);
    expect(await verifyPubimgSig("asset-2", url.searchParams.get("e")!, url.searchParams.get("h")!)).toBe(false);
    expect(await verifyPubimgSig("asset-1", "abc", url.searchParams.get("h")!)).toBe(false);

    // Expired: a link minted 8 days ago no longer verifies.
    const stale = await pubimgLink("asset-1", Date.now() / 1000 - 8 * 24 * 60 * 60);
    const su = new URL(stale, "https://x.test");
    expect(await verifyPubimgSig("asset-1", su.searchParams.get("e")!, su.searchParams.get("h")!)).toBe(false);
  });

  it("cache keys are asset+derivative+revision; purge never throws without the Cache API", async () => {
    expect(pubimgCacheKey("a1", "plain", 42)).toBe("https://pubimg.cache/a1?d=plain&r=42");
    expect(pubimgCacheKey("a1", "wm", 43)).not.toBe(pubimgCacheKey("a1", "plain", 43));
    await expect(purgePubimgCache("a1", 42)).resolves.toBeUndefined();
  });
});

describe("resolvePublicPortfolioImage (membership is the boundary)", () => {
  it("AC1: not-curated, draft site, and unlisted collection all resolve null", async () => {
    const studio = await seedStudio();
    const project = await seedProject(studio.organizationId);
    const stranger = await seedAsset({ organizationId: studio.organizationId, projectId: project });
    // Never curated anywhere → 404.
    expect(await resolvePublicPortfolioImage(stranger)).toBeNull();

    const { site, collection, ids, studio: owner } = await publishedSiteWithImage();
    expect((await resolvePublicPortfolioImage(ids[0]))?.previewKey).toBe(`${owner.organizationId}/${ids[0]}/preview.jpg`);

    // Draft site → null.
    await updatePortfolioSite(owner.organizationId, { status: "draft" });
    expect(await resolvePublicPortfolioImage(ids[0])).toBeNull();
    await updatePortfolioSite(owner.organizationId, { status: "published" });
    expect(await resolvePublicPortfolioImage(ids[0])).not.toBeNull();

    // Unlisted collection → null (even though the site stays published).
    const flip = await updateCollection(owner.organizationId, collection.id, { visibility: "unlisted" });
    expect(flip.ok).toBe(true);
    expect(await resolvePublicPortfolioImage(ids[0])).toBeNull();
    expect(await getPublishedPortfolio(site.slug)).not.toBeNull(); // site itself still up
  });

  it("AC3: curating an asset out revokes it immediately; unpublish revokes the whole site", async () => {
    const { studio, site, collection, ids } = await publishedSiteWithImage();
    expect(await resolvePublicPortfolioImage(ids[1])).not.toBeNull();
    expect(await removeAssetFromCollection(studio.organizationId, collection.id, ids[1])).toBe(true);
    expect(await resolvePublicPortfolioImage(ids[1])).toBeNull();

    expect(await removeAssetFromCollection(studio.organizationId, collection.id, ids[0])).toBe(true);
    expect(await resolvePublicPortfolioImage(ids[0])).toBeNull();

    // Re-add restores, then unpublish kills everything.
    await addAssetsToCollection(studio.organizationId, collection.id, ids, null);
    expect(await resolvePublicPortfolioImage(ids[0])).not.toBeNull();
    await updatePortfolioSite(studio.organizationId, { status: "draft" });
    expect(await resolvePublicPortfolioImage(ids[0])).toBeNull();
    expect(await getPublishedPortfolio(site.slug)).toBeNull();
  });

  it("AC4: resolve exposes derivative keys only — a RAW membership row is structurally unservable", async () => {
    const { studio, ids } = await publishedSiteWithImage();
    const resolved = await resolvePublicPortfolioImage(ids[0]);
    expect(resolved).not.toBeNull();
    expect(Object.keys(resolved!).sort()).toEqual(
      ["assetId", "height", "organizationId", "previewKey", "previewWmKey", "revision", "width"].sort(),
    );
    expect(resolved!.previewWmKey).toBeNull(); // wm slot exists but no derivative baked

    // Defense in depth: even a RAW row smuggled into membership (repo gates
    // normally reject this) resolves null — the route can never serve RAW.
    const project = await seedProject(studio.organizationId);
    const raw = await seedAsset({ organizationId: studio.organizationId, projectId: project, kind: "raw" });
    const col = await createCollection(studio.organizationId, { title: "Raw" }, null);
    if (!col.ok) throw new Error("seed collection failed");
    await getDb().insert(schema.portfolioCollectionAssets).values({
      id: crypto.randomUUID(),
      collectionId: col.collection.id,
      assetId: raw,
      sort: 1,
    });
    expect(await resolvePublicPortfolioImage(raw)).toBeNull();
  });
});

describe("public payload carries signed pubimg URLs, not R2 keys", () => {
  it("items expose image=/api/pubimg/{assetId}?e&h and no storage/preview keys", async () => {
    const { site, ids } = await publishedSiteWithImage();
    const pub = await getPublishedPortfolio(site.slug);
    expect(pub).not.toBeNull();
    const items = pub!.collections.flatMap((c) => c.items);
    expect(items).toHaveLength(ids.length);
    for (const item of items) {
      expect(item.image).toMatch(new RegExp(`^/api/pubimg/${item.assetId}\\?e=\\d+&h=[a-f0-9]{64}$`));
      expect("previewKey" in item).toBe(false);
      expect("thumbKey" in item).toBe(false);
      const u = new URL(item.image, "https://x.test");
      expect(await verifyPubimgSig(item.assetId, u.searchParams.get("e")!, u.searchParams.get("h")!)).toBe(true);
    }
  });
});
