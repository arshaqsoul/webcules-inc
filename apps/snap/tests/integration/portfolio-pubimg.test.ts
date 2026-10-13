/* WEB-345 — /api/pubimg: the public portfolio image primitive. Membership is
 * the boundary (resolve re-runs on every request, so curate-out/unlist/
 * unpublish 404 immediately), signatures are HMAC over asset+expiry, and
 * the public payload carries signed pubimg URLs instead of R2 keys. */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { GET as pubimgRoute } from "@/app/api/pubimg/[id]/route";
import { jpegExifInfo } from "@/lib/exif";
import { pubimgCacheKey, pubimgLink, purgePubimgCache, verifyPubimgSig } from "@/lib/pubimg-link";
import { deleteObject, putObject } from "@/lib/storage/service";
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
  const pub = await updatePortfolioSite(studio.organizationId, {
    status: "published",
    rightsAttested: true,
    actorUserId: studio.userId,
  });
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
    await updatePortfolioSite(owner.organizationId, {
      status: "published",
      rightsAttested: true,
      actorUserId: owner.userId,
    });
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

/* ------------------------------ route level ------------------------------ */

async function fetchPubimg(assetId: string, link?: string) {
  const l = link ?? (await pubimgLink(assetId));
  const [path, query] = l.slice(1).split("?");
  return pubimgRoute(new Request(`https://x.test/${path}?${query}`), {
    params: Promise.resolve({ id: assetId }),
  });
}

/** Minimal JPEG carrying an APP1/Exif (TIFF, no GPS) segment. */
function exifJpeg(): Uint8Array {
  const tiff = [
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // II*, IFD0 @ 8
    0x00, 0x00, // IFD0 entry count = 0
  ];
  const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff]; // "Exif\0\0" + TIFF
  const size = payload.length + 2;
  return new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xe1, size >> 8, size & 0xff, ...payload, // APP1 Exif
    0xff, 0xda, 0x00, 0x02, // SOS
    0xff, 0xd9, // EOI
  ]);
}

describe("/api/pubimg route (WEB-345 acceptance)", () => {
  it("AC1/AC2: private assets and bad signatures all 404 through the route", async () => {
    const { studio, ids } = await publishedSiteWithImage();
    // Both images are public; curate ids[1] out to make it private.
    const col = (await getDb().select().from(schema.portfolioCollections).limit(1))[0];
    await removeAssetFromCollection(studio.organizationId, col.id, ids[1]);

    // Valid sig on a non-member (private) asset → 404, no bytes oracle.
    const priv = await fetchPubimg(ids[1]);
    expect(priv.status).toBe(404);

    // Tampered signature on a PUBLIC asset → 404 (membership alone is not enough).
    const link = await pubimgLink(ids[0]);
    const tampered = link.replace(/h=[a-f0-9]{64}/, `h=${"0".repeat(64)}`);
    expect((await fetchPubimg(ids[0], tampered)).status).toBe(404);

    // Expired signature → 404.
    const stale = await pubimgLink(ids[0], Date.now() / 1000 - 8 * 24 * 60 * 60);
    expect((await fetchPubimg(ids[0], stale)).status).toBe(404);

    // Malformed id → 404 without touching anything.
    expect((await fetchPubimg("../../etc/passwd")).status).toBe(404);
  });

  it("AC4: serves the web-size preview derivative only, EXIF-stripped", async () => {
    const { studio, ids } = await publishedSiteWithImage();
    const org = studio.organizationId;
    // The original exists in R2 — it must never be reachable through pubimg.
    await putObject(org, `${ids[0]}/original.jpg`, new TextEncoder().encode("ORIGINAL-BYTES-NEVER-PUBLIC").buffer as ArrayBuffer, "image/jpeg");
    // A preview derivative that (against doctrine) still carries EXIF.
    const previewSuffix = `${ids[0]}/preview.jpg`;
    await putObject(org, previewSuffix, exifJpeg().slice().buffer as ArrayBuffer, "image/jpeg");
    expect(jpegExifInfo(exifJpeg().slice().buffer as ArrayBuffer).exif).toBe(true); // fixture sanity

    const res = await fetchPubimg(ids[0]);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toContain("public");
    expect(res.headers.get("x-snap-exif")).toBe("stripped");
    const bytes = await res.arrayBuffer();
    expect(jpegExifInfo(bytes).exif).toBe(false);
    // Stripped bytes are the APP1-less prefix/suffix of the seeded derivative…
    expect(bytes.byteLength).toBeLessThan(exifJpeg().byteLength);
    // …and never the original.
    expect(new TextDecoder().decode(bytes)).not.toContain("ORIGINAL-BYTES-NEVER-PUBLIC");
  });

  it("AC3: curate-out 404s immediately even with a warm edge entry; re-curate serves again", async () => {
    const { studio, ids } = await publishedSiteWithImage();
    const org = studio.organizationId;
    const previewSuffix = `${ids[0]}/preview.jpg`;
    await putObject(org, previewSuffix, new TextEncoder().encode("preview-bytes").buffer as ArrayBuffer, "image/jpeg");
    const col = (await getDb().select().from(schema.portfolioCollections).limit(1))[0];

    const first = await fetchPubimg(ids[0]);
    expect(first.status).toBe(200);
    expect(new TextDecoder().decode(await first.arrayBuffer())).toBe("preview-bytes");

    // The edge entry exists and serves without R2 (long-lived cache proof).
    await deleteObject(org, `${org}/${previewSuffix}`);
    const cached = await fetchPubimg(ids[0]);
    const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
    if (cache) {
      expect(cached.status).toBe(200);
      expect(new TextDecoder().decode(await cached.arrayBuffer())).toBe("preview-bytes");
    }

    // Curate-out purges: the very next fetch 404s, warm cache or not.
    expect(await removeAssetFromCollection(org, col.id, ids[0])).toBe(true);
    expect((await fetchPubimg(ids[0])).status).toBe(404);

    // Unpublish kills the remaining asset the same way.
    await putObject(org, `${ids[1]}/preview.jpg`, new TextEncoder().encode("preview-1").buffer as ArrayBuffer, "image/jpeg");
    expect((await fetchPubimg(ids[1])).status).toBe(200);
    await updatePortfolioSite(org, { status: "draft" });
    expect((await fetchPubimg(ids[1])).status).toBe(404);

    // Re-curate + re-publish rotates the revision and serves fresh bytes.
    await addAssetsToCollection(org, col.id, [ids[0]], null);
    await updatePortfolioSite(org, { status: "published", rightsAttested: true });
    await putObject(org, previewSuffix, new TextEncoder().encode("preview-bytes-2").buffer as ArrayBuffer, "image/jpeg");
    const again = await fetchPubimg(ids[0]);
    expect(again.status).toBe(200);
    expect(new TextDecoder().decode(await again.arrayBuffer())).toBe("preview-bytes-2");
  });

  it("watermarked studio gets the wm derivative — the original is structurally unreachable", async () => {
    const studio = await seedStudio({ plan: "studio" });
    await getOrCreatePortfolioSite(studio.organizationId, "Showcase");
    const project = await seedProject(studio.organizationId);
    const id = await seedAsset({ organizationId: studio.organizationId, projectId: project, kind: "image" });
    await getDb()
      .update(schema.assets)
      .set({
        previewKey: `${studio.organizationId}/${id}/preview.jpg`,
        previewWmKey: `${studio.organizationId}/${id}/preview_wm.jpg`,
        storageKey: `${studio.organizationId}/${id}/original.jpg`,
      })
      .where(eq(schema.assets.id, id));
    await putObject(studio.organizationId, `${id}/original.jpg`, new TextEncoder().encode("ORIGINAL").buffer as ArrayBuffer, "image/jpeg");
    await putObject(studio.organizationId, `${id}/preview.jpg`, new TextEncoder().encode("PLAIN-PREVIEW").buffer as ArrayBuffer, "image/jpeg");
    await putObject(studio.organizationId, `${id}/preview_wm.jpg`, new TextEncoder().encode("WM-PREVIEW").buffer as ArrayBuffer, "image/jpeg");
    await getDb()
      .update(schema.studioProfiles)
      .set({ brand: JSON.stringify({ watermark: { mode: "corner" } }) })
      .where(eq(schema.studioProfiles.organizationId, studio.organizationId));
    const col = await createCollection(studio.organizationId, { title: "Best" }, null);
    if (!col.ok) throw new Error("seed collection failed");
    await addAssetsToCollection(studio.organizationId, col.collection.id, [id], null);
    await updatePortfolioSite(studio.organizationId, { status: "published", rightsAttested: true });

    const res = await fetchPubimg(id);
    expect(res.status).toBe(200);
    expect(new TextDecoder().decode(await res.arrayBuffer())).toBe("WM-PREVIEW");
  });
});
