/* WEB-170 (Commerce C2 1/7) — cart keying, merge-on-re-entry, monotonic
 * states, and tenant/grant-scope isolation for the store cart repo. */
import { beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { createShareGrant } from "@/lib/shares/grants";
import {
  CART_STATES,
  addCartItem,
  getCartById,
  getOrCreateCart,
  getOpenCart,
  setCartItemQuantity,
  setCartCoupon,
  setCartStatus,
  subtotalCents,
} from "@/lib/repos/carts";
import { resetDb } from "../helpers/db";
import { seedAsset, seedProject, seedStudio } from "../helpers/seed";

beforeEach(resetDb);

async function seedGrant() {
  const studio = await seedStudio({ plan: "lite" });
  const projectId = await seedProject(studio.organizationId);
  const assetId = await seedAsset({ organizationId: studio.organizationId, projectId, kind: "image", filename: "a.jpg", status: "approved" });
  const grant = await createShareGrant({
    organizationId: studio.organizationId,
    projectId,
    clientEmail: "client@t.test",
    assetIds: [assetId],
    expiresAt: null,
    createdById: studio.userId,
  });
  expect(grant.ok).toBe(true);
  return { studio, grantId: grant.ok ? grant.grantId : "" };
}

/** A second grant row that "replaced" `oldId` — old becomes regenerated and
 * the new active grant points back at it via parent_grant_id. */
async function regenerateGrant(oldId: string) {
  const db = getDb();
  const old = (await db.select().from(schema.shareGrants).where(eq(schema.shareGrants.id, oldId)).limit(1))[0];
  const id = crypto.randomUUID();
  await db.update(schema.shareGrants).set({ status: "regenerated" }).where(eq(schema.shareGrants.id, oldId));
  await db.insert(schema.shareGrants).values({
    id,
    organizationId: old.organizationId,
    projectId: old.projectId,
    clientEmail: old.clientEmail,
    tokenHash: `th-${crypto.randomUUID()}`,
    status: "active",
    parentGrantId: old.id,
    expiresAt: null,
  });
  return id;
}

const add = (organizationId: string, grantId: string, visitorId: string, variantId = "v1", price = 1500, quantity = 1, currency = "USD") =>
  addCartItem({ organizationId, grantId, visitorId, variantId, name: `Item ${variantId}`, unitPriceCents: price, quantity, currency });

describe("guest-grant keying (WEB-170)", () => {
  it("creates one open cart per (grant, visitor); re-entry resumes the same cart", async () => {
    const { studio, grantId } = await seedGrant();
    const first = await getOrCreateCart({ organizationId: studio.organizationId, grantId, visitorId: "visitor-a", currency: "USD" });
    expect(first.ok).toBe(true);
    await add(studio.organizationId, grantId, "visitor-a", "v1");
    const again = await getOrCreateCart({ organizationId: studio.organizationId, grantId, visitorId: "visitor-a", currency: "USD" });
    expect(again.ok).toBe(true);
    if (first.ok && again.ok) expect(again.value.id).toBe(first.value.id);
    const open = await getOpenCart(studio.organizationId, grantId, "visitor-a");
    expect(open.ok).toBe(true);
    if (open.ok) expect(open.value.items).toHaveLength(1);
  });

  it("separate visitors on the same grant get separate carts", async () => {
    const { studio, grantId } = await seedGrant();
    const a = await getOrCreateCart({ organizationId: studio.organizationId, grantId, visitorId: "visitor-a", currency: "USD" });
    const b = await getOrCreateCart({ organizationId: studio.organizationId, grantId, visitorId: "visitor-b", currency: "USD" });
    expect(a.ok && b.ok && a.value.id !== b.value.id).toBe(true);
  });

  it("locks one currency per cart and refuses mismatches", async () => {
    const { studio, grantId } = await seedGrant();
    await add(studio.organizationId, grantId, "visitor-a", "v1", 1500, 1, "USD");
    expect(await add(studio.organizationId, grantId, "visitor-a", "v2", 999, 1, "EUR")).toEqual({ ok: false, error: "currency_mismatch" });
    expect(await getOrCreateCart({ organizationId: studio.organizationId, grantId, visitorId: "visitor-c", currency: "dollars" })).toEqual({
      ok: false,
      error: "invalid_currency",
    });
  });

  it("merges quantities for the same variant and enforces quantity bounds", async () => {
    const { studio, grantId } = await seedGrant();
    await add(studio.organizationId, grantId, "visitor-a", "v1", 1500, 2);
    await add(studio.organizationId, grantId, "visitor-a", "v1", 1500, 3);
    const open = await getOpenCart(studio.organizationId, grantId, "visitor-a");
    if (!open.ok) throw new Error("expected open cart");
    expect(open.value.items).toEqual([expect.objectContaining({ variantId: "v1", quantity: 5 })]);
    expect(await add(studio.organizationId, grantId, "visitor-a", "v1", 1500, 95)).toEqual({ ok: false, error: "invalid_quantity" });
    expect(await add(studio.organizationId, grantId, "visitor-a", "v2", 1500, 0)).toEqual({ ok: false, error: "invalid_quantity" });
    expect(await add(studio.organizationId, grantId, "visitor-a", "v3", -5)).toEqual({ ok: false, error: "invalid_amount" });
    expect(await add(studio.organizationId, grantId, "visitor-a", "", 1500)).toEqual({ ok: false, error: "invalid_variant" });
  });
});

describe("merge on re-entry (WEB-170)", () => {
  it("adopts the visitor's open cart when the gallery link was regenerated", async () => {
    const { studio, grantId: oldGrant } = await seedGrant();
    await add(studio.organizationId, oldGrant, "visitor-a", "v1", 1500, 1);
    const newGrant = await regenerateGrant(oldGrant);

    // Old scope is dead: the regenerated grant refuses new carts.
    expect(await add(studio.organizationId, oldGrant, "visitor-a", "v2", 999, 1)).toEqual({ ok: false, error: "grant_inactive" });

    // Re-entry via the new link: the old open cart is re-keyed, not lost.
    const resumed = await getOpenCart(studio.organizationId, newGrant, "visitor-a");
    expect(resumed.ok).toBe(true);
    if (resumed.ok) {
      expect(resumed.value.cart.grantId).toBe(newGrant);
      expect(resumed.value.items).toEqual([expect.objectContaining({ variantId: "v1", quantity: 1 })]);
    }
  });

  it("folds duplicate open carts: quantities sum, newest snapshot wins, sources become merged", async () => {
    const { studio, grantId: oldGrant } = await seedGrant();
    const db = getDb();
    // Two open carts for the same visitor — only reachable across grant
    // generations (the partial unique index blocks same-grant duplicates):
    // one under the original grant, one under its regeneration.
    const older = (
      await db
        .insert(schema.carts)
        .values({
          id: crypto.randomUUID(),
          organizationId: studio.organizationId,
          grantId: oldGrant,
          visitorId: "visitor-a",
          currency: "USD",
          createdAt: new Date(Date.now() - 120_000),
          updatedAt: new Date(Date.now() - 120_000),
        })
        .returning()
    )[0];
    await db.insert(schema.cartItems).values({ id: crypto.randomUUID(), cartId: older.id, variantId: "v1", name: "Old name", unitPriceCents: 999, quantity: 2 });

    const newGrant = await regenerateGrant(oldGrant);
    const newer = (
      await db
        .insert(schema.carts)
        .values({
          id: crypto.randomUUID(),
          organizationId: studio.organizationId,
          grantId: newGrant,
          visitorId: "visitor-a",
          currency: "USD",
          createdAt: new Date(Date.now() - 60_000),
          updatedAt: new Date(Date.now() - 60_000),
        })
        .returning()
    )[0];
    await db.insert(schema.cartItems).values({ id: crypto.randomUUID(), cartId: newer.id, variantId: "v1", name: "New name", unitPriceCents: 1500, quantity: 1 });

    // Re-entry folds everything into one open cart (newest snapshot wins).
    const merged = await getOrCreateCart({ organizationId: studio.organizationId, grantId: newGrant, visitorId: "visitor-a", currency: "USD" });
    expect(merged.ok).toBe(true);
    const rows = await db.select().from(schema.carts).where(eq(schema.carts.visitorId, "visitor-a"));
    expect(rows.filter((c) => c.status === "open")).toHaveLength(1);
    expect(rows.filter((c) => c.status === "merged")).toHaveLength(1);

    const open = await getOpenCart(studio.organizationId, newGrant, "visitor-a");
    if (!open.ok) throw new Error("expected open cart");
    expect(open.value.cart.grantId).toBe(newGrant);
    expect(open.value.items).toEqual([expect.objectContaining({ variantId: "v1", quantity: 3, unitPriceCents: 1500, name: "New name" })]);
  });
});

describe("monotonic cart states (WEB-170)", () => {
  it("allows open → terminal once, refuses every later transition", async () => {
    const { studio, grantId } = await seedGrant();
    const created = await getOrCreateCart({ organizationId: studio.organizationId, grantId, visitorId: "visitor-a", currency: "USD" });
    if (!created.ok) throw new Error("expected cart");
    const cartId = created.value.id;
    await add(studio.organizationId, grantId, "visitor-a", "v1", 1500, 2);

    expect(await setCartStatus({ organizationId: studio.organizationId, cartId, status: "converted" })).toEqual({ ok: true, value: "converted" });
    // Same-state is idempotent…
    expect(await setCartStatus({ organizationId: studio.organizationId, cartId, status: "converted" })).toEqual({ ok: true, value: "converted" });
    // …anything else is refused, including "back" to open.
    expect(await setCartStatus({ organizationId: studio.organizationId, cartId, status: "open" })).toEqual({ ok: false, error: "invalid_transition" });
    expect(await setCartStatus({ organizationId: studio.organizationId, cartId, status: "expired" })).toEqual({ ok: false, error: "invalid_transition" });
    expect(await setCartStatus({ organizationId: studio.organizationId, cartId, status: "bogus" as never })).toEqual({ ok: false, error: "invalid_transition" });

    // A closed cart refuses cart-scoped writes by id…
    expect(await setCartCoupon({ organizationId: studio.organizationId, cartId, couponCode: "SAVE10" })).toEqual({ ok: false, error: "cart_not_open" });
    expect(await setCartItemQuantity({ organizationId: studio.organizationId, cartId, variantId: "v1", quantity: 2 })).toEqual({ ok: false, error: "cart_not_open" });
    // …and the converted cart no longer shows as the visitor's open cart.
    const open = await getOpenCart(studio.organizationId, grantId, "visitor-a");
    expect(open).toEqual({ ok: false, error: "not_found" });
  });

  it("every declared state is reachable from open and enumerated", async () => {
    expect(CART_STATES).toEqual(["open", "merged", "cancelled", "expired", "converted"]);
    for (const status of ["cancelled", "expired", "merged"] as const) {
      const { studio, grantId } = await seedGrant();
      const created = await getOrCreateCart({ organizationId: studio.organizationId, grantId, visitorId: `v-${status}`, currency: "USD" });
      if (!created.ok) throw new Error("expected cart");
      expect(await setCartStatus({ organizationId: studio.organizationId, cartId: created.value.id, status })).toEqual({ ok: true, value: status });
    }
  });

  it("stores and clears the coupon code", async () => {
    const { studio, grantId } = await seedGrant();
    const created = await getOrCreateCart({ organizationId: studio.organizationId, grantId, visitorId: "visitor-a", currency: "USD" });
    if (!created.ok) throw new Error("expected cart");
    expect(await setCartCoupon({ organizationId: studio.organizationId, cartId: created.value.id, couponCode: " SAVE10 " })).toEqual({ ok: true, value: true });
    const stored = await getCartById(studio.organizationId, created.value.id);
    if (!stored.ok) throw new Error("expected cart");
    expect(stored.value.cart.couponCode).toBe("SAVE10");
    expect(await setCartCoupon({ organizationId: studio.organizationId, cartId: created.value.id, couponCode: null })).toEqual({ ok: true, value: true });
    const cleared = await getCartById(studio.organizationId, created.value.id);
    if (!cleared.ok) throw new Error("expected cart");
    expect(cleared.value.cart.couponCode).toBeNull();
  });
});

describe("tenant and grant scope (WEB-170)", () => {
  it("another org cannot see, use, or mutate a grant's carts", async () => {
    const { studio, grantId } = await seedGrant();
    const other = await seedStudio({ plan: "lite" });

    // Wrong-org callers get not_found — no existence leak.
    expect(await getOrCreateCart({ organizationId: other.organizationId, grantId, visitorId: "visitor-a", currency: "USD" })).toEqual({ ok: false, error: "not_found" });
    expect(await add(other.organizationId, grantId, "visitor-a", "v1")).toEqual({ ok: false, error: "not_found" });
    expect(await getOpenCart(other.organizationId, grantId, "visitor-a")).toEqual({ ok: false, error: "not_found" });

    // Cart rows created by the owning org are invisible to the other org.
    const created = await getOrCreateCart({ organizationId: studio.organizationId, grantId, visitorId: "visitor-a", currency: "USD" });
    if (!created.ok) throw new Error("expected cart");
    expect(await getCartById(other.organizationId, created.value.id)).toEqual({ ok: false, error: "not_found" });
    expect(await setCartStatus({ organizationId: other.organizationId, cartId: created.value.id, status: "cancelled" })).toEqual({ ok: false, error: "not_found" });
  });

  it("a different grant in the same org is a different cart scope", async () => {
    const { studio, grantId } = await seedGrant();
    const projectId = await seedProject(studio.organizationId);
    const assetId = await seedAsset({ organizationId: studio.organizationId, projectId, kind: "image", filename: "b.jpg", status: "approved" });
    const otherGrant = await createShareGrant({
      organizationId: studio.organizationId,
      projectId,
      clientEmail: "other@t.test",
      assetIds: [assetId],
      expiresAt: null,
      createdById: studio.userId,
    });
    expect(otherGrant.ok).toBe(true);
    const otherGrantId = otherGrant.ok ? otherGrant.grantId : "";

    await add(studio.organizationId, grantId, "visitor-a", "v1", 1500, 2);
    expect(await getOpenCart(studio.organizationId, otherGrantId, "visitor-a")).toEqual({ ok: false, error: "not_found" });
    const separate = await getOrCreateCart({ organizationId: studio.organizationId, grantId: otherGrantId, visitorId: "visitor-a", currency: "USD" });
    const original = await getOpenCart(studio.organizationId, grantId, "visitor-a");
    if (!separate.ok || !original.ok) throw new Error("expected carts");
    expect(separate.value.id).not.toBe(original.value.cart.id);
  });

  it("revoked and expired grants refuse cart activity", async () => {
    const { studio, grantId } = await seedGrant();
    await getDb().update(schema.shareGrants).set({ status: "revoked" }).where(eq(schema.shareGrants.id, grantId));
    expect(await add(studio.organizationId, grantId, "visitor-a", "v1")).toEqual({ ok: false, error: "grant_inactive" });

    const second = await seedGrant(); // a different studio + grant
    const db = getDb();
    const g2 = (await db.select().from(schema.shareGrants).where(eq(schema.shareGrants.id, second.grantId)).limit(1))[0];
    await db.update(schema.shareGrants).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(schema.shareGrants.id, g2.id));
    expect(await getOrCreateCart({ organizationId: g2.organizationId, grantId: g2.id, visitorId: "v", currency: "USD" })).toEqual({
      ok: false,
      error: "grant_inactive",
    });
  });

  it("subtotal sums snapshot prices × quantities; lines update and remove", async () => {
    const { studio, grantId } = await seedGrant();
    const created = await add(studio.organizationId, grantId, "visitor-a", "v1", 1500, 2);
    if (!created.ok) throw new Error("expected cart");
    await add(studio.organizationId, grantId, "visitor-a", "v2", 499, 1);
    const open = await getOpenCart(studio.organizationId, grantId, "visitor-a");
    if (!open.ok) throw new Error("expected open cart");
    expect(subtotalCents(open.value.items)).toBe(3499);

    expect(await setCartItemQuantity({ organizationId: studio.organizationId, cartId: created.value.id, variantId: "v1", quantity: 4 })).toEqual({ ok: true, value: true });
    expect(await setCartItemQuantity({ organizationId: studio.organizationId, cartId: created.value.id, variantId: "v1", quantity: 0 })).toEqual({ ok: true, value: true });
    const after = await getOpenCart(studio.organizationId, grantId, "visitor-a");
    if (!after.ok) throw new Error("expected open cart");
    expect(after.value.items.map((i) => i.variantId)).toEqual(["v2"]);
    expect(await setCartItemQuantity({ organizationId: studio.organizationId, cartId: created.value.id, variantId: "v9", quantity: 1 })).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});
