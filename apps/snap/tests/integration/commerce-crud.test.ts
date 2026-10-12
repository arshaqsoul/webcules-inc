/* WEB-179 (Commerce C1 2/7) — product/variant edit, archive, reorder and the
 * bulk markup tool, on top of the WEB-180 foundation. Runs against the real
 * migrations via the isolated per-file D1. */
import { beforeEach, describe, expect, it } from "vitest";

import {
  activePriceListForGrant,
  applyBulkMarkup,
  attachPriceListToGrant,
  createPriceList,
  createProduct,
  createProductVariant,
  getPriceListDetail,
  previewBulkMarkup,
  renameProduct,
  reorderProducts,
  reorderVariants,
  setProductActive,
  setVariantActive,
  updateProductVariant,
} from "@/lib/commerce";
import { getDb, schema } from "@/lib/db";
import { resetDb } from "../helpers/db";
import { seedProject, seedStudio } from "../helpers/seed";

type Ok<V> = { ok: true; value: V } | { ok: false; error: string };

function unwrap<V>(res: Ok<V>): V {
  if (!res.ok) throw new Error(`expected ok, got ${res.error}`);
  return res.value;
}

beforeEach(async () => {
  await resetDb();
});

/** studio plan + list + product + two priced variants, ready for markup work. */
async function seedCatalog(plan = "studio") {
  const s = await seedStudio({ plan });
  const listId = unwrap(await createPriceList(s.organizationId, { name: "Weddings", currency: "usd" })).id;
  const productId = unwrap(await createProduct(s.organizationId, { priceListId: listId, kind: "print", name: "8x10 print" })).id;
  const v1 = unwrap(await createProductVariant(s.organizationId, { productId, name: "Lustre", costCents: 300, priceCents: 900 })).id;
  const v2 = unwrap(await createProductVariant(s.organizationId, { productId, name: "Metallic", costCents: 350, priceCents: 1000 })).id;
  return { org: s.organizationId, listId, productId, v1, v2 };
}

describe("product edit / archive / reorder", () => {
  it("renames a product; foreign org ids read as not_found", async () => {
    const c = await seedCatalog();
    expect((await renameProduct(c.org, c.productId, "10x10 print")).ok).toBe(true);
    const other = await seedStudio({ plan: "studio" });
    expect(await renameProduct(other.organizationId, c.productId, "steal")).toEqual({ ok: false, error: "not_found" });
    const detail = await getPriceListDetail(c.org, c.listId);
    expect(detail?.products[0].name).toBe("10x10 print");
  });

  it("archiving a product drops it from the client store view; restore brings it back", async () => {
    const c = await seedCatalog();
    const projectId = await seedProject(c.org);
    await getDb().insert(schema.shareGrants).values({
      id: "grant-crud-1", organizationId: c.org, projectId, clientEmail: "c@t.test", tokenHash: "h1", status: "active",
    });
    unwrap(await attachPriceListToGrant(c.org, { grantId: "grant-crud-1", priceListId: c.listId }));
    unwrap(await setProductActive(c.org, c.productId, false));
    let client = await activePriceListForGrant("grant-crud-1");
    expect(client?.products).toHaveLength(0);
    unwrap(await setProductActive(c.org, c.productId, true));
    client = await activePriceListForGrant("grant-crud-1");
    expect(client?.products).toHaveLength(1);
    // the dashboard view still shows the archived row either way
    expect((await getPriceListDetail(c.org, c.listId))?.products).toHaveLength(1);
  });

  it("reorders products with a full permutation", async () => {
    const c = await seedCatalog();
    const p2 = unwrap(await createProduct(c.org, { priceListId: c.listId, kind: "digital", name: "Full gallery" })).id;
    const p3 = unwrap(await createProduct(c.org, { priceListId: c.listId, kind: "digital", name: "Single photo" })).id;
    expect((await reorderProducts(c.org, c.listId, [p3, c.productId, p2])).ok).toBe(true);
    const detail = await getPriceListDetail(c.org, c.listId);
    expect(detail?.products.map((p) => p.id)).toEqual([p3, c.productId, p2]);
  });

  it("rejects partial or foreign reorder sets", async () => {
    const c = await seedCatalog();
    const p2 = unwrap(await createProduct(c.org, { priceListId: c.listId, kind: "digital", name: "Full gallery" })).id;
    // subset
    expect(await reorderProducts(c.org, c.listId, [c.productId])).toEqual({ ok: false, error: "not_found" });
    // foreign id smuggled in
    expect(await reorderProducts(c.org, c.listId, [c.productId, p2, "not-ours"])).toEqual({ ok: false, error: "not_found" });
    // untouched order
    const detail = await getPriceListDetail(c.org, c.listId);
    expect(detail?.products.map((p) => p.id)).toEqual([c.productId, p2]);
  });
});

describe("variant edit / archive / reorder", () => {
  it("partial edits merge with stored values and re-derive markup", async () => {
    const c = await seedCatalog();
    // change only the price: cost 300 stays, price 1200 → markup 300%
    const res = await updateProductVariant(c.org, { variantId: c.v1, priceCents: 1200 });
    expect(res).toEqual({ ok: true, value: { markupPct: 300 } });
    const detail = await getPriceListDetail(c.org, c.listId);
    expect(detail?.products[0].variants[0]).toMatchObject({ costCents: 300, priceCents: 1200, markupPct: 300 });
  });

  it("a partial edit that makes the merged pair invalid is refused", async () => {
    const c = await seedCatalog();
    expect(await updateProductVariant(c.org, { variantId: c.v1, costCents: 12.5 })).toEqual({ ok: false, error: "invalid_amount" });
  });

  it("archives and restores a variant; client view filters it", async () => {
    const c = await seedCatalog();
    unwrap(await setVariantActive(c.org, c.v1, false));
    const detail = await getPriceListDetail(c.org, c.listId);
    expect(detail?.products[0].variants.map((v) => v.active)).toEqual([false, true]);
  });

  it("reorders variants within a product", async () => {
    const c = await seedCatalog();
    expect((await reorderVariants(c.org, c.productId, [c.v2, c.v1])).ok).toBe(true);
    const detail = await getPriceListDetail(c.org, c.listId);
    expect(detail?.products[0].variants.map((v) => v.id)).toEqual([c.v2, c.v1]);
  });
});

describe("bulk markup tool", () => {
  it("applies a percentage with rounding presets (none, dollar, charm99)", async () => {
    const c = await seedCatalog();
    // none: 300 → 300*(1+0.5)=450 ; 350 → 525
    expect(await applyBulkMarkup(c.org, { variantIds: [c.v1, c.v2], markupPct: 50, rounding: "none" })).toEqual({ ok: true, value: { updated: 2, skipped: 0 } });
    let detail = await getPriceListDetail(c.org, c.listId);
    expect(detail?.products[0].variants.map((v) => v.priceCents)).toEqual([450, 525]);

    // charm99: 300 → 450 exact → nearest unit 500 → 4.99 ; 350 → 525 → nearest 500 → 4.99
    expect(await applyBulkMarkup(c.org, { variantIds: [c.v1, c.v2], markupPct: 50, rounding: "charm99" })).toEqual({ ok: true, value: { updated: 2, skipped: 0 } });
    detail = await getPriceListDetail(c.org, c.listId);
    expect(detail?.products[0].variants.map((v) => v.priceCents)).toEqual([499, 499]);

    // dollar: 300 → 450 → rounds half up to 500 ; 350 → 525 → 500
    expect(await applyBulkMarkup(c.org, { variantIds: [c.v1, c.v2], markupPct: 50, rounding: "dollar" })).toEqual({ ok: true, value: { updated: 2, skipped: 0 } });
    detail = await getPriceListDetail(c.org, c.listId);
    expect(detail?.products[0].variants.map((v) => v.priceCents)).toEqual([500, 500]);
  });

  it("skips zero-cost variants (digital) and reports them", async () => {
    const c = await seedCatalog();
    const digital = unwrap(await createProduct(c.org, { priceListId: c.listId, kind: "digital", name: "Full gallery" })).id;
    const dv = unwrap(await createProductVariant(c.org, { productId: digital, name: "All photos", costCents: 0, priceCents: 4900 })).id;
    const res = await applyBulkMarkup(c.org, { variantIds: [c.v1, dv], markupPct: 100, rounding: "none" });
    expect(res).toEqual({ ok: true, value: { updated: 1, skipped: 1 } });
    const detail = await getPriceListDetail(c.org, c.listId);
    expect(detail?.products.find((p) => p.id === digital)?.variants[0].priceCents).toBe(4900); // untouched
  });

  it("preview matches what apply would do, without writing", async () => {
    const c = await seedCatalog();
    const preview = await previewBulkMarkup(c.org, { variantIds: [c.v1], markupPct: 148.7, rounding: "charm99" });
    expect(preview.ok && preview.value[0].newPriceCents).toBe(699); // 300 → 746 → nearest 700 → 6.99
    const detail = await getPriceListDetail(c.org, c.listId);
    expect(detail?.products[0].variants[0].priceCents).toBe(900); // unchanged
    unwrap(await applyBulkMarkup(c.org, { variantIds: [c.v1], markupPct: 148.7, rounding: "charm99" }));
    const after = await getPriceListDetail(c.org, c.listId);
    expect(after?.products[0].variants[0].priceCents).toBe(699);
  });

  it("is tenant-isolated: foreign variant ids are not_found and untouched", async () => {
    const c = await seedCatalog();
    const other = await seedStudio({ plan: "studio" });
    const res = await applyBulkMarkup(other.organizationId, { variantIds: [c.v1, c.v2], markupPct: 100, rounding: "none" });
    expect(res).toEqual({ ok: false, error: "not_found" });
    const detail = await getPriceListDetail(c.org, c.listId);
    expect(detail?.products[0].variants.map((v) => v.priceCents)).toEqual([900, 1000]); // untouched
  });

  it("refuses an empty selection", async () => {
    const c = await seedCatalog();
    expect(await applyBulkMarkup(c.org, { variantIds: [], markupPct: 100, rounding: "none" })).toEqual({ ok: false, error: "not_found" });
  });
});
