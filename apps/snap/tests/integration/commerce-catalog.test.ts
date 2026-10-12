/* WEB-180 (Commerce C1 1/7) — catalog foundation: price lists, products,
 * variants, plan gates, and the one-active-list-per-gallery assignment.
 * Runs against the real migrations (0067) via the isolated per-file D1. */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { getDb, schema } from "@/lib/db";
import {
  activePriceListForGrant,
  attachPriceListToGrant,
  createPriceList,
  createProduct,
  createProductVariant,
  detachPriceListFromGrant,
  getPriceListDetail,
  listPriceLists,
  renamePriceList,
  setDefaultPriceList,
} from "@/lib/commerce";
import { resetDb } from "../helpers/db";
import { seedProject, seedStudio } from "../helpers/seed";

type Ok<V> = { ok: true; value: V } | { ok: false; error: string };

/** Unwrap a result the test already asserted is ok (fails loudly otherwise). */
function okId(res: Ok<{ id: string }>): string {
  if (!res.ok) throw new Error(`expected ok, got ${res.error}`);
  return res.value.id;
}

async function seedGrant(organizationId: string, projectId: string, id: string): Promise<string> {
  await getDb().insert(schema.shareGrants).values({
    id, organizationId, projectId, clientEmail: "client@test.test",
    tokenHash: `hash-${id}`, status: "active",
  });
  return id;
}

async function makeList(organizationId: string, name = "Store"): Promise<string> {
  return okId(await createPriceList(organizationId, { name, currency: "usd" }));
}

beforeEach(async () => {
  await resetDb();
});

describe("plan gates (WEB-180 ladder: store Lite+, packages/custom Studio+)", () => {
  it("free cannot create a price list — store_disabled", async () => {
    const s = await seedStudio({ plan: "free" });
    const res = await createPriceList(s.organizationId, { name: "Spring 2027", currency: "usd" });
    expect(res).toEqual({ ok: false, error: "store_disabled" });
  });

  it("lite gets exactly one price list — second is refused with list_limit_reached", async () => {
    const s = await seedStudio({ plan: "lite" });
    expect((await createPriceList(s.organizationId, { name: "Weddings", currency: "usd" })).ok).toBe(true);
    const second = await createPriceList(s.organizationId, { name: "Portraits", currency: "usd" });
    expect(second).toEqual({ ok: false, error: "list_limit_reached" });
  });

  it("studio gets five lists; the org's first list is the default, later ones are not", async () => {
    const s = await seedStudio({ plan: "studio" });
    for (const name of ["A", "B", "C", "D", "E"]) {
      await makeList(s.organizationId, name);
    }
    const sixth = await createPriceList(s.organizationId, { name: "F", currency: "usd" });
    expect(sixth).toEqual({ ok: false, error: "list_limit_reached" });
    const lists = await listPriceLists(s.organizationId);
    expect(lists).toHaveLength(5);
    expect(lists.filter((l) => l.isDefault).map((l) => l.name)).toEqual(["A"]);
  });

  it("rejects bad names and currencies through the core validators", async () => {
    const s = await seedStudio({ plan: "studio" });
    expect(await createPriceList(s.organizationId, { name: "   ", currency: "usd" })).toEqual({ ok: false, error: "invalid_name" });
    expect(await createPriceList(s.organizationId, { name: "Ok", currency: "dollars" })).toEqual({ ok: false, error: "invalid_currency" });
    // currency is normalized to uppercase on the way in
    await createPriceList(s.organizationId, { name: "Ok", currency: "eur" });
    expect((await listPriceLists(s.organizationId))[0].currency).toBe("EUR");
  });
});

describe("products and variants", () => {
  it("digital product on lite; packages and custom products need Studio", async () => {
    const lite = await seedStudio({ plan: "lite" });
    const listId = await makeList(lite.organizationId);

    expect((await createProduct(lite.organizationId, { priceListId: listId, kind: "digital", name: "Single photo" })).ok).toBe(true);
    expect(await createProduct(lite.organizationId, { priceListId: listId, kind: "package", name: "10 favorites" })).toEqual({ ok: false, error: "kind_not_allowed" });
    expect(await createProduct(lite.organizationId, { priceListId: listId, kind: "custom", name: "Album" })).toEqual({ ok: false, error: "kind_not_allowed" });

    const studio = await seedStudio({ plan: "studio" });
    const sListId = await makeList(studio.organizationId);
    for (const kind of ["digital", "package", "custom"] as const) {
      const res = await createProduct(studio.organizationId, { priceListId: sListId, kind, name: kind });
      expect(`${kind}: ${res.ok}`).toBe(`${kind}: true`);
    }
    expect(await createProduct(studio.organizationId, { priceListId: sListId, kind: "poster" as never, name: "x" })).toEqual({ ok: false, error: "invalid_kind" });
  });

  it("variant money is integer cents; markup_pct is derived on read, never stored", async () => {
    const s = await seedStudio({ plan: "studio" });
    const listId = await makeList(s.organizationId);
    const productId = okId(await createProduct(s.organizationId, { priceListId: listId, kind: "digital", name: "Single photo" }));

    // print-style variant: cost 1000, price 1500 → 50% markup
    const v1 = await createProductVariant(s.organizationId, { productId, name: "8x10", costCents: 1000, priceCents: 1500 });
    expect(v1.ok && v1.value.markupPct).toBe(50);
    // digital variant: cost 0 → markup undefined (null)
    const v2 = await createProductVariant(s.organizationId, { productId, name: "Full res", costCents: 0, priceCents: 1200 });
    expect(v2.ok && v2.value.markupPct).toBeNull();

    expect(await createProductVariant(s.organizationId, { productId, name: "Bad", costCents: -1, priceCents: 100 })).toEqual({ ok: false, error: "invalid_amount" });
    expect(await createProductVariant(s.organizationId, { productId, name: "Bad", costCents: 10, priceCents: 12.5 })).toEqual({ ok: false, error: "invalid_amount" });

    const detail = await getPriceListDetail(s.organizationId, listId);
    const variants = detail?.products[0].variants ?? [];
    expect(variants.map((v) => [v.name, v.markupPct])).toEqual([["8x10", 50], ["Full res", null]]);
    // positions were assigned in creation order
    expect(variants.map((v) => v.position)).toEqual([0, 1]);
    // and no markup column exists to drift — derived only
    expect(Object.keys(variants[0])).toContain("markupPct");
  });

  it("rename and set-default stay org-scoped; cross-org ids read as not_found", async () => {
    const a = await seedStudio({ plan: "studio", name: "Studio A" });
    const b = await seedStudio({ plan: "studio", name: "Studio B" });
    const a1Id = await makeList(a.organizationId, "A1");
    const a2Id = await makeList(a.organizationId, "A2");

    expect(await renamePriceList(b.organizationId, a1Id, "Stolen")).toEqual({ ok: false, error: "not_found" });
    expect(await setDefaultPriceList(b.organizationId, a2Id)).toEqual({ ok: false, error: "not_found" });
    expect(await getPriceListDetail(b.organizationId, a1Id)).toBeNull();

    expect(await renamePriceList(a.organizationId, a1Id, "A1 renamed")).toEqual({ ok: true, value: true });
    expect(await setDefaultPriceList(a.organizationId, a2Id)).toEqual({ ok: true, value: true });
    const lists = await listPriceLists(a.organizationId);
    expect(lists.find((l) => l.isDefault)?.name).toBe("A2");
    expect(lists.find((l) => l.name === "A1 renamed")).toBeTruthy();
  });
});

describe("gallery assignment — one active price list per gallery", () => {
  it("attaching a second list replaces the first; detach clears the store", async () => {
    const s = await seedStudio({ plan: "studio" });
    const project = await seedProject(s.organizationId);
    const grantId = await seedGrant(s.organizationId, project, "grant-1");
    const l1Id = await makeList(s.organizationId, "List 1");
    const l2Id = await makeList(s.organizationId, "List 2");
    const productId = okId(await createProduct(s.organizationId, { priceListId: l1Id, kind: "digital", name: "Photo" }));
    await createProductVariant(s.organizationId, { productId, name: "Full res", costCents: 0, priceCents: 900 });

    expect(await activePriceListForGrant(grantId)).toBeNull();

    expect(await attachPriceListToGrant(s.organizationId, { grantId, priceListId: l1Id })).toEqual({ ok: true, value: true });
    expect((await activePriceListForGrant(grantId))?.name).toBe("List 1");
    expect((await activePriceListForGrant(grantId))?.products).toHaveLength(1);

    // replacing does not duplicate: still exactly one active assignment row
    expect(await attachPriceListToGrant(s.organizationId, { grantId, priceListId: l2Id })).toEqual({ ok: true, value: true });
    expect((await activePriceListForGrant(grantId))?.name).toBe("List 2");
    const rows = await getDb().select().from(schema.priceListGallery);
    expect(rows.filter((r) => r.detachedAt === null)).toHaveLength(1);
    // history is kept for audit
    expect(rows).toHaveLength(2);

    expect(await detachPriceListFromGrant(s.organizationId, grantId)).toEqual({ ok: true, value: true });
    expect(await activePriceListForGrant(grantId)).toBeNull();
    expect(await detachPriceListFromGrant(s.organizationId, grantId)).toEqual({ ok: false, error: "not_found" });
  });

  it("a grant and a list from different orgs cannot be attached (tenant isolation)", async () => {
    const a = await seedStudio({ plan: "studio", name: "Studio A" });
    const b = await seedStudio({ plan: "studio", name: "Studio B" });
    const projectA = await seedProject(a.organizationId);
    const grantA = await seedGrant(a.organizationId, projectA, "grant-a");
    const listBId = await makeList(b.organizationId, "B's list");
    const listAId = await makeList(a.organizationId, "A's list");
    const projectB = await seedProject(b.organizationId);
    const grantB = await seedGrant(b.organizationId, projectB, "grant-b");

    // B's list onto A's gallery → not_found; A's list onto B's gallery → not_found
    expect(await attachPriceListToGrant(a.organizationId, { grantId: grantA, priceListId: listBId })).toEqual({ ok: false, error: "not_found" });
    expect(await attachPriceListToGrant(a.organizationId, { grantId: grantB, priceListId: listAId })).toEqual({ ok: false, error: "not_found" });
    expect(await activePriceListForGrant(grantA)).toBeNull();
  });

  it("the client store view hides inactive products", async () => {
    const s = await seedStudio({ plan: "studio" });
    const project = await seedProject(s.organizationId);
    const grantId = await seedGrant(s.organizationId, project, "grant-2");
    const listId = await makeList(s.organizationId);
    await createProduct(s.organizationId, { priceListId: listId, kind: "digital", name: "Live" });
    const hiddenId = okId(await createProduct(s.organizationId, { priceListId: listId, kind: "digital", name: "Hidden" }));
    await getDb().update(schema.products).set({ active: false }).where(eq(schema.products.id, hiddenId));
    await attachPriceListToGrant(s.organizationId, { grantId, priceListId: listId });

    const active = await activePriceListForGrant(grantId);
    expect(active?.products.map((p) => p.name)).toEqual(["Live"]);
    // studio detail still sees everything
    const detail = await getPriceListDetail(s.organizationId, listId);
    expect(detail?.products).toHaveLength(2);
  });
});
