/* WEB-305 portfolio core — curated public collections: tier caps enforced
 * on write paths (Free 1/20, Lite 5/250, Studio+ unlimited per WEB-302 §4),
 * tenant isolation (foreign assets are not_owned), slug namespacing,
 * publish gating, and the public-ness boundary (only curated items of a
 * published site, in visible collections, reach the public payload). */
import { beforeEach, describe, expect, it } from "vitest";

import { planDef } from "@/lib/plans-data";
import {
  addAssetsToCollection,
  countPortfolioItems,
  createCollection,
  deleteCollection,
  getOrCreatePortfolioSite,
  getPublishedPortfolio,
  listCollectionAssets,
  listCollections,
  removeAssetFromCollection,
  reorderCollectionAssets,
  updateCollection,
  updatePortfolioSite,
} from "@/lib/repos/portfolio";
import { resetDb } from "../helpers/db";
import { seedAsset, seedProject, seedStudio } from "../helpers/seed";

beforeEach(async () => {
  await resetDb();
});

async function seedImages(org: string, n: number, kind: "image" | "raw" = "image") {
  const project = await seedProject(org);
  const ids: string[] = [];
  for (let i = 0; i < n; i++) ids.push(await seedAsset({ organizationId: org, projectId: project, kind }));
  return ids;
}

async function mustCollection(org: string, title: string) {
  const r = await createCollection(org, { title }, null);
  if (!r.ok) throw new Error(`seed collection failed: ${r.error}`);
  return r.collection;
}

async function mustAdd(org: string, collectionId: string, ids: string[], cap: number | null) {
  const r = await addAssetsToCollection(org, collectionId, ids, cap);
  if (!r.ok) throw new Error(`seed add failed: ${r.error}`);
  return r.added;
}

describe("plan gates (WEB-302 §4 ladder)", () => {
  it("plans-data carries the CFO-cleared caps", () => {
    expect(planDef("free").maxPortfolioCollections).toBe(1);
    expect(planDef("free").maxPortfolioItems).toBe(20);
    expect(planDef("lite").maxPortfolioCollections).toBe(5);
    expect(planDef("lite").maxPortfolioItems).toBe(250);
    expect(planDef("studio").maxPortfolioCollections).toBeNull();
    expect(planDef("studio").maxPortfolioItems).toBeNull();
    expect(planDef("pro").maxPortfolioCollections).toBeNull();
    expect(planDef("pro").maxPortfolioItems).toBeNull();
  });

  it("free org: second collection is limit_reached", async () => {
    const studio = await seedStudio({ plan: "free" });
    const cap = planDef("free").maxPortfolioCollections;
    const first = await createCollection(studio.organizationId, { title: "Weddings" }, cap);
    expect(first.ok).toBe(true);
    const second = await createCollection(studio.organizationId, { title: "Portraits" }, cap);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe("limit_reached");
  });

  it("lite org: 5 collections fine, 6th rejected", async () => {
    const studio = await seedStudio({ plan: "lite" });
    const cap = planDef("lite").maxPortfolioCollections;
    for (let i = 0; i < 5; i++) {
      const r = await createCollection(studio.organizationId, { title: `Set ${i}` }, cap);
      expect(r.ok).toBe(true);
    }
    const sixth = await createCollection(studio.organizationId, { title: "Sixth" }, cap);
    expect(sixth.ok).toBe(false);
    if (!sixth.ok) expect(sixth.error).toBe("limit_reached");
  });

  it("org-wide item cap: 20 items ok, 21st limit_reached (free)", async () => {
    const studio = await seedStudio({ plan: "free" });
    const ids = await seedImages(studio.organizationId, 21);
    const col = await mustCollection(studio.organizationId, "Best");
    const cap = planDef("free").maxPortfolioItems;
    await mustAdd(studio.organizationId, col.id, ids.slice(0, 20), cap);
    expect(await countPortfolioItems(studio.organizationId)).toBe(20);
    const over = await addAssetsToCollection(studio.organizationId, col.id, [ids[20]], cap);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error).toBe("limit_reached");
    expect(await countPortfolioItems(studio.organizationId)).toBe(20);
  });

  it("null cap (Studio) never gates", async () => {
    const studio = await seedStudio({ plan: "studio" });
    const ids = await seedImages(studio.organizationId, 30);
    const col = await mustCollection(studio.organizationId, "All");
    expect(await mustAdd(studio.organizationId, col.id, ids, null)).toBe(30);
  });
});

describe("tenant isolation and kind rules", () => {
  it("another org's asset is not_owned and never enters the collection", async () => {
    const a = await seedStudio({ name: "Studio A" });
    const b = await seedStudio({ name: "Studio B" });
    const bIds = await seedImages(b.organizationId, 2);
    const col = await mustCollection(a.organizationId, "A work");
    const r = await addAssetsToCollection(a.organizationId, col.id, bIds, null);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("not_owned");
      expect(r.rejected).toEqual(bIds);
    }
    expect(await countPortfolioItems(a.organizationId)).toBe(0);
  });

  it("non-image assets (RAW) are rejected — public collections serve image derivatives only", async () => {
    const studio = await seedStudio();
    const ids = await seedImages(studio.organizationId, 2, "raw");
    const col = await mustCollection(studio.organizationId, "Raw");
    const r = await addAssetsToCollection(studio.organizationId, col.id, ids, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("not_image");
  });

  it("updateCollection with a foreign cover asset is not_owned", async () => {
    const a = await seedStudio({ name: "Cover A" });
    const b = await seedStudio({ name: "Cover B" });
    const bIds = await seedImages(b.organizationId, 1);
    const col = await mustCollection(a.organizationId, "A");
    const r = await updateCollection(a.organizationId, col.id, { coverAssetId: bIds[0] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("not_owned");
  });
});

describe("site lifecycle and public boundary", () => {
  it("slug collision across orgs gets a nonce suffix", async () => {
    const orgA = (await seedStudio({ name: "Aurora Studio" })).organizationId;
    const orgB = (await seedStudio({ name: "Aurora Studio" })).organizationId;
    const a = await getOrCreatePortfolioSite(orgA, "Aurora Studio");
    const b = await getOrCreatePortfolioSite(orgB, "Aurora Studio");
    expect(a.slug).toBe("aurora-studio");
    expect(b.slug).not.toBe(a.slug);
    expect(b.slug.startsWith("aurora-studio-")).toBe(true);
  });

  it("publishing an empty site is empty_site; with a curated public collection it publishes", async () => {
    const studio = await seedStudio();
    const site = await getOrCreatePortfolioSite(studio.organizationId, "Priya Photo");
    const empty = await updatePortfolioSite(studio.organizationId, { status: "published" });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error).toBe("empty_site");

    const ids = await seedImages(studio.organizationId, 3);
    const col = await mustCollection(studio.organizationId, "Weddings");
    await mustAdd(studio.organizationId, col.id, ids, null);
    const published = await updatePortfolioSite(studio.organizationId, { status: "published" });
    expect(published.ok).toBe(true);

    const pub = await getPublishedPortfolio(site.slug);
    expect(pub).not.toBeNull();
    expect(pub!.collections).toHaveLength(1);
    expect(pub!.collections[0].items.map((i) => i.assetId).sort()).toEqual([...ids].sort());
    if (published.ok) expect(published.site.publishedAt).not.toBeNull();
  });

  it("draft site is never public; unlisting a collection drops it from the payload", async () => {
    const studio = await seedStudio();
    const site = await getOrCreatePortfolioSite(studio.organizationId, "Quiet");
    const ids = await seedImages(studio.organizationId, 2);
    const publicCol = await mustCollection(studio.organizationId, "Public");
    const otherCol = await mustCollection(studio.organizationId, "Sneak");
    await mustAdd(studio.organizationId, publicCol.id, ids, null);
    await mustAdd(studio.organizationId, otherCol.id, ids, null);
    await updatePortfolioSite(studio.organizationId, { status: "published" });

    // Both visible while both are public.
    let pub = await getPublishedPortfolio(site.slug);
    expect(pub!.collections.map((c) => c.slug).sort()).toEqual(["public", "sneak"].sort());

    // Unlist one → gone from the public payload immediately.
    const flip = await updateCollection(studio.organizationId, otherCol.id, { visibility: "unlisted" });
    expect(flip.ok).toBe(true);
    pub = await getPublishedPortfolio(site.slug);
    expect(pub!.collections.map((c) => c.slug)).toEqual(["public"]);

    // Unpublish → the whole site vanishes.
    const off = await updatePortfolioSite(studio.organizationId, { status: "draft" });
    expect(off.ok).toBe(true);
    expect(await getPublishedPortfolio(site.slug)).toBeNull();
  });
});

describe("curation ops", () => {
  it("re-add is a no-op; remove + reorder round-trip; delete cascades items", async () => {
    const studio = await seedStudio();
    const ids = await seedImages(studio.organizationId, 3);
    const col = await mustCollection(studio.organizationId, "C");
    const cid = col.id;

    expect(await mustAdd(studio.organizationId, cid, ids, null)).toBe(3);
    expect(await mustAdd(studio.organizationId, cid, ids, null)).toBe(0); // no-op re-add
    expect((await listCollectionAssets(studio.organizationId, cid)).map((i) => i.assetId)).toEqual(ids);

    const rev = [...ids].reverse();
    const ro = await reorderCollectionAssets(studio.organizationId, cid, rev);
    expect(ro.ok).toBe(true);
    expect((await listCollectionAssets(studio.organizationId, cid)).map((i) => i.assetId)).toEqual(rev);

    // Reorder with a foreign id is rejected, never silently ignored.
    const bad = await reorderCollectionAssets(studio.organizationId, cid, [ids[0], "nope"]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toBe("invalid_values");

    expect(await removeAssetFromCollection(studio.organizationId, cid, ids[1])).toBe(true);
    expect(await countPortfolioItems(studio.organizationId)).toBe(2);

    expect(await deleteCollection(studio.organizationId, cid)).toBe(true);
    expect(await countPortfolioItems(studio.organizationId)).toBe(0);
    expect(await listCollections(studio.organizationId)).toHaveLength(0);
  });
});
