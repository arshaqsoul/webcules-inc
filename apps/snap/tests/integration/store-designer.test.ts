/* WEB-277 (Commerce C1 6/7) — the store designer surface: the open/closed
 * status toggle (studio-wide, audited), first-run template price lists
 * (atomic, plan-gated), the products overview, and the Setup Guide "store"
 * step's auto-flip behavior. WEBC-121 (audit F9): done = store OPEN + ≥1
 * active product + ≥1 ACTIVE price-list→gallery attachment — every signal
 * combination, and the automatic flip when the last signal arrives. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import {
  STORE_TEMPLATES,
  attachPriceListToGrant,
  countPriceLists,
  createPriceList,
  createPriceListFromTemplate,
  createProduct,
  createProductVariant,
  detachPriceListFromGrant,
  getStoreOpen,
  listAllProducts,
  listPriceLists,
  setStoreOpen,
} from "@/lib/commerce";
import { getSetupState } from "@/lib/repos/setup";
import { resetDb } from "../helpers/db";
import { seedProject, seedStudio } from "../helpers/seed";

beforeEach(async () => {
  await resetDb();
});

function step(state: Awaited<ReturnType<typeof getSetupState>>, id: string) {
  return state.steps.find((s) => s.id === id)!;
}

describe("store status (open/closed)", () => {
  it("defaults to closed and flips with an audit row", async () => {
    const s = await seedStudio({ plan: "studio" });
    expect(await getStoreOpen(s.organizationId)).toBe(false);

    expect(await setStoreOpen(s.organizationId, s.userId, true)).toBe(true);
    expect(await getStoreOpen(s.organizationId)).toBe(true);
    const audit = await getDb().select().from(schema.auditLog).where(eq(schema.auditLog.action, "store.status_changed"));
    expect(audit).toHaveLength(1);
    expect(audit[0].meta).toBe(JSON.stringify({ open: true }));

    expect(await setStoreOpen(s.organizationId, s.userId, false)).toBe(true);
    expect(await getStoreOpen(s.organizationId)).toBe(false);
    expect((await getDb().select().from(schema.auditLog).where(eq(schema.auditLog.action, "store.status_changed"))).length).toBe(2);
  });

  it("closing never deletes price lists or products", async () => {
    const s = await seedStudio({ plan: "studio" });
    const t = await createPriceListFromTemplate(s.organizationId, "portrait", s.userId);
    expect(t.ok).toBe(true);
    await setStoreOpen(s.organizationId, s.userId, true);
    await setStoreOpen(s.organizationId, s.userId, false);
    expect(await countPriceLists(s.organizationId)).toBe(1);
    expect((await getDb().select().from(schema.products).where(eq(schema.products.organizationId, s.organizationId))).length).toBeGreaterThan(0);
  });

  it("returns false (nothing changed) when the profile is missing", async () => {
    const s = await seedStudio({ plan: "studio" });
    await getDb().delete(schema.studioProfiles).where(eq(schema.studioProfiles.organizationId, s.organizationId));
    expect(await setStoreOpen(s.organizationId, s.userId, true)).toBe(false);
  });
});

describe("first-run template price lists", () => {
  it("seeds the full template on studio plan in one atomic batch", async () => {
    const s = await seedStudio({ plan: "studio" });
    const res = await createPriceListFromTemplate(s.organizationId, "wedding", s.userId);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.skippedKinds).toEqual([]);

    const db = getDb();
    const lists = await db.select().from(schema.priceLists).where(eq(schema.priceLists.organizationId, s.organizationId));
    expect(lists).toHaveLength(1);
    expect(lists[0].name).toBe("Wedding");
    expect(lists[0].isDefault).toBe(true);
    expect(lists[0].currency).toBe("USD");

    const products = await db.select().from(schema.products).where(eq(schema.products.priceListId, res.value.id));
    expect(products).toHaveLength(STORE_TEMPLATES.wedding.products.length);
    const variants = await db.select().from(schema.productVariants).where(eq(schema.productVariants.organizationId, s.organizationId));
    expect(variants).toHaveLength(STORE_TEMPLATES.wedding.products.reduce((n, p) => n + p.variants.length, 0));

    const audit = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "store.template_list_created"));
    expect(audit).toHaveLength(1);
    expect(JSON.parse(audit[0].meta!).template).toBe("wedding");
  });

  it("adapts to the plan: lite skips packages and custom", async () => {
    const s = await seedStudio({ plan: "lite" });
    const res = await createPriceListFromTemplate(s.organizationId, "event", s.userId);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect([...res.value.skippedKinds].sort()).toEqual(["custom", "package"]);
    const products = await getDb().select().from(schema.products).where(eq(schema.products.priceListId, res.value.id));
    expect(products.map((p) => p.kind)).toEqual(["digital"]);
  });

  it("respects the family list quota (lite = 1 list)", async () => {
    const s = await seedStudio({ plan: "lite" });
    expect((await createPriceListFromTemplate(s.organizationId, "portrait", s.userId)).ok).toBe(true);
    const second = await createPriceListFromTemplate(s.organizationId, "event", s.userId);
    expect(second).toEqual({ ok: false, error: "list_limit_reached" });
  });

  it("refuses free plan (store disabled) and unknown templates", async () => {
    const free = await seedStudio({ plan: "free" });
    expect(await createPriceListFromTemplate(free.organizationId, "portrait", free.userId)).toEqual({ ok: false, error: "store_disabled" });
    const s = await seedStudio({ plan: "studio" });
    expect(await createPriceListFromTemplate(s.organizationId, "nope", s.userId)).toEqual({ ok: false, error: "not_found" });
    expect(await countPriceLists(s.organizationId)).toBe(0);
  });

  it("the second list is not default", async () => {
    const s = await seedStudio({ plan: "studio" });
    const a = await createPriceListFromTemplate(s.organizationId, "portrait", s.userId);
    const b = await createPriceListFromTemplate(s.organizationId, "wedding", s.userId);
    expect(a.ok && b.ok).toBe(true);
    const lists = await getDb().select().from(schema.priceLists).where(eq(schema.priceLists.organizationId, s.organizationId));
    expect(lists.filter((l) => l.isDefault)).toHaveLength(1);
  });
});

describe("products overview", () => {
  it("lists products across lists with variant counts and price ranges", async () => {
    const s = await seedStudio({ plan: "studio" });
    const t = await createPriceListFromTemplate(s.organizationId, "portrait", s.userId);
    expect(t.ok).toBe(true);
    const rows = await listAllProducts(s.organizationId);
    expect(rows).toHaveLength(3);
    const prints = rows.find((r) => r.name === "Prints")!;
    expect(prints.priceListName).toBe("Portrait session");
    expect(prints.variantCount).toBe(2);
    expect(prints.minPriceCents).toBe(1400);
    expect(prints.maxPriceCents).toBe(1800);
    expect(prints.priceListCurrency).toBe("USD");
    expect(await listAllProducts(s.organizationId)).toHaveLength(3); // stable read
  });
});

describe("price lists table count (WEBC-126)", () => {
  it("listPriceLists returns the true per-list product count, not 0", async () => {
    const s = await seedStudio({ plan: "studio" });
    const t = await createPriceListFromTemplate(s.organizationId, "portrait", s.userId);
    expect(t.ok).toBe(true);
    const empty = await createPriceList(s.organizationId, { name: "Empty list", currency: "usd" });
    expect(empty.ok).toBe(true);

    const lists = await listPriceLists(s.organizationId);
    expect(lists.find((l) => l.name === "Portrait session")?.productCount).toBe(3); // the template's 3 products
    expect(lists.find((l) => l.name === "Empty list")?.productCount).toBe(0);

    // cross-tenant safety: another studio's products never leak into the count
    const other = await seedStudio({ plan: "studio" });
    expect(await createProduct(other.organizationId, { priceListId: lists[0].id, kind: "digital", name: "Stolen" })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect((await listPriceLists(s.organizationId)).find((l) => l.name === "Portrait session")?.productCount).toBe(3);
  });
});

describe("Setup Guide \"Set up your store\" step — auto-flip (WEBC-121: open + product + attached)", () => {
  /** A live gallery grant (attach needs an org-owned row to exist). */
  async function seedGrant(organizationId: string, projectId: string, id: string): Promise<string> {
    await getDb().insert(schema.shareGrants).values({
      id, organizationId, projectId, clientEmail: "client@test.test",
      tokenHash: `hash-${id}`, status: "active",
    });
    return id;
  }

  /** The full sellable state: open store, a product, an attachment. */
  async function makeSellable(s: Awaited<ReturnType<typeof seedStudio>>) {
    const listId = (await createPriceList(s.organizationId, { name: "Portrait session", currency: "usd" }));
    if (!listId.ok) throw new Error(listId.error);
    const product = await createProduct(s.organizationId, { priceListId: listId.value.id, kind: "digital", name: "Digital collection" });
    if (!product.ok) throw new Error(product.error);
    await createProductVariant(s.organizationId, { productId: product.value.id, name: "Single image", costCents: 0, priceCents: 1200 });
    const projectId = await seedProject(s.organizationId);
    const grantId = await seedGrant(s.organizationId, projectId, crypto.randomUUID());
    const attach = await attachPriceListToGrant(s.organizationId, { grantId, priceListId: listId.value.id });
    if (!attach.ok) throw new Error(attach.error);
    return { listId: listId.value.id, grantId };
  }

  it("untouched studio: not done", async () => {
    const s = await seedStudio({ plan: "studio" });
    const state = await getSetupState(s.organizationId);
    expect(step(state, "store").done).toBe(false);
    expect(step(state, "store").title).toBe("Set up your store");
    expect(step(state, "store").why).toBe("Open the store, price a product, and attach it to a gallery — sell right from your galleries.");
    expect(step(state, "store").href).toBe("/dashboard/store?setup=1");
  });

  it("open store only: not done", async () => {
    const s = await seedStudio({ plan: "studio" });
    await setStoreOpen(s.organizationId, s.userId, true);
    expect(step(await getSetupState(s.organizationId), "store").done).toBe(false);
  });

  it("open + product, nothing attached: not done", async () => {
    const s = await seedStudio({ plan: "studio" });
    await setStoreOpen(s.organizationId, s.userId, true);
    const list = await createPriceList(s.organizationId, { name: "Portrait session", currency: "usd" });
    if (!list.ok) throw new Error(list.error);
    const product = await createProduct(s.organizationId, { priceListId: list.value.id, kind: "print", name: "8×10 print" });
    if (!product.ok) throw new Error(product.error);
    await createProductVariant(s.organizationId, { productId: product.value.id, name: "Lustre", costCents: 200, priceCents: 1400 });
    expect(step(await getSetupState(s.organizationId), "store").done).toBe(false);
  });

  it("product + attachment but the store is closed: not done", async () => {
    const s = await seedStudio({ plan: "studio" });
    await makeSellable(s);
    // makeSellable leaves the store closed — closed means clients can't buy
    expect(step(await getSetupState(s.organizationId), "store").done).toBe(false);
  });

  it("all three signals: done — and it flips automatically when the last arrives", async () => {
    const s = await seedStudio({ plan: "studio" });
    await setStoreOpen(s.organizationId, s.userId, true);
    expect(step(await getSetupState(s.organizationId), "store").done).toBe(false);
    await makeSellable(s);
    const state = await getSetupState(s.organizationId);
    expect(step(state, "store").done).toBe(true);
    expect(state.total).toBe(12);
  });

  it("payouts are NOT part of the signal — open + priced + attached is done without Stripe", async () => {
    const s = await seedStudio({ plan: "studio" });
    expect((await getSetupState(s.organizationId)).steps.find((x) => x.id === "payouts")!.done).toBe(false);
    await setStoreOpen(s.organizationId, s.userId, true);
    await makeSellable(s);
    expect(step(await getSetupState(s.organizationId), "store").done).toBe(true);
  });

  it("archiving the only product un-completes the step; detaching the gallery does too", async () => {
    const s = await seedStudio({ plan: "studio" });
    await setStoreOpen(s.organizationId, s.userId, true);
    const { listId, grantId } = await makeSellable(s);
    expect(step(await getSetupState(s.organizationId), "store").done).toBe(true);

    expect(await detachPriceListFromGrant(s.organizationId, grantId)).toEqual({ ok: true, value: true });
    expect(step(await getSetupState(s.organizationId), "store").done).toBe(false);

    const attach = await attachPriceListToGrant(s.organizationId, { grantId, priceListId: listId });
    expect(attach.ok).toBe(true);
    expect(step(await getSetupState(s.organizationId), "store").done).toBe(true);
  });

  it("the checklist carries every step with a deep link except the demo action", async () => {
    const s = await seedStudio({ plan: "studio" });
    const state = await getSetupState(s.organizationId);
    expect(state.steps.filter((x) => x.href).length).toBe(11);
  });
});
