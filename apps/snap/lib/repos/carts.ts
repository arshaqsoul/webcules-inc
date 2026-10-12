/* Commerce carts repository (WEB-170 / Linear WEB-354, C2 1/7) — server-side
 * guest carts for gallery stores.
 *
 * Keying: a cart belongs to one gallery share_grant plus an opaque anonymous
 * visitor cookie id. Per-photo share links (WEB-262) resolve to the same
 * gallery grant, so every entry path shares one cart scope. When a gallery
 * link is regenerated the fresh grant points at its predecessor via
 * parent_grant_id — on re-entry the visitor's older open cart(s) under
 * ancestor grants are folded into the current scope ("merge on re-entry").
 *
 * States are monotonic: open → merged | cancelled | expired | converted.
 * Terminal states never re-open and never transition again; same-state is an
 * idempotent no-op. Lines snapshot name/price at add time (catalog may change
 * underneath — checkout re-prices live in C2 3/7). */

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "../db";
import * as schema from "../db-schema";
import { grantState } from "../shares/grants";

export type CartRow = typeof schema.carts.$inferSelect;
export type CartItemRow = typeof schema.cartItems.$inferSelect;

export const CART_STATES = ["open", "merged", "cancelled", "expired", "converted"] as const;
export type CartStatus = (typeof CART_STATES)[number];

/** Terminal states — only `open` may transition, and only forward. */
export const CART_TERMINAL: readonly CartStatus[] = ["merged", "cancelled", "expired", "converted"];

export type CartError =
  | "not_found"
  | "grant_inactive"
  | "invalid_currency"
  | "currency_mismatch"
  | "invalid_amount"
  | "invalid_name"
  | "invalid_variant"
  | "invalid_quantity"
  | "invalid_transition"
  | "cart_not_open";

export type CartResult<T> = { ok: true; value: T } | { ok: false; error: CartError };

export const MAX_ITEM_QUANTITY = 99;
const CURRENCY_RE = /^[A-Z]{3}$/;

/** Cookie the gallery route sets for anonymous buyers (opaque random id —
 * never an account id). Read on every store request; wiring lands with the
 * drawer routes (C2 2/7). */
export const CART_VISITOR_COOKIE = "snap_cart_visitor";

function normalizeCurrency(code: string): string | null {
  const c = code.trim().toUpperCase();
  return CURRENCY_RE.test(c) ? c : null;
}

/** The gallery grant a cart should be keyed to: the entry grant itself. Photo
 * shares point at the gallery grant already (photo_share.grant_id), so no
 * child→parent walk is needed here — regeneration ancestry is handled by
 * foldAncestors below. Verifies tenant + liveness. */
async function activeGalleryGrant(
  organizationId: string,
  grantId: string,
): Promise<CartResult<typeof schema.shareGrants.$inferSelect>> {
  const grant = (
    await getDb()
      .select()
      .from(schema.shareGrants)
      .where(and(eq(schema.shareGrants.id, grantId), eq(schema.shareGrants.organizationId, organizationId)))
      .limit(1)
  )[0];
  if (!grant) return { ok: false, error: "not_found" };
  if (grantState(grant) !== "active") return { ok: false, error: "grant_inactive" };
  return { ok: true, value: grant };
}

/** Ancestor grants of `grant` via parent_grant_id (regeneration chain),
 * oldest first. Capped defensively at 8 hops. */
async function ancestorGrantIds(grant: typeof schema.shareGrants.$inferSelect): Promise<string[]> {
  const db = getDb();
  const chain: string[] = [];
  let current = grant.parentGrantId;
  for (let hop = 0; current && hop < 8; hop += 1) {
    chain.push(current);
    const parent = (await db.select().from(schema.shareGrants).where(eq(schema.shareGrants.id, current)).limit(1))[0];
    if (!parent) break;
    current = parent.parentGrantId;
  }
  return chain;
}

/** Fold duplicate open carts into `target`: per variant the target's snapshot
 * wins and quantities sum; sources become `merged`. Targets keep status open. */
async function foldInto(target: CartRow, sources: CartRow[]): Promise<void> {
  if (!sources.length) return;
  const db = getDb();
  const sourceIds = sources.map((c) => c.id);
  const targetItems = await db.select().from(schema.cartItems).where(eq(schema.cartItems.cartId, target.id));
  const byVariant = new Map(targetItems.map((item) => [item.variantId, item]));
  const moved = await db.select().from(schema.cartItems).where(inArray(schema.cartItems.cartId, sourceIds));
  for (const item of moved.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const existing = byVariant.get(item.variantId);
    if (existing) {
      await db
        .update(schema.cartItems)
        .set({ quantity: Math.min(existing.quantity + item.quantity, MAX_ITEM_QUANTITY), updatedAt: new Date() })
        .where(eq(schema.cartItems.id, existing.id));
    } else {
      await db.insert(schema.cartItems).values({
        id: crypto.randomUUID(),
        cartId: target.id,
        variantId: item.variantId,
        name: item.name,
        unitPriceCents: item.unitPriceCents,
        quantity: item.quantity,
      });
      byVariant.set(item.variantId, { ...item, id: crypto.randomUUID(), cartId: target.id });
    }
  }
  await db.update(schema.carts).set({ status: "merged", updatedAt: new Date() }).where(inArray(schema.carts.id, sourceIds));
  await db.update(schema.carts).set({ updatedAt: new Date() }).where(eq(schema.carts.id, target.id));
}

/** The visitor's OPEN cart for a gallery scope: existing open carts across the
 * current grant AND ancestor (regenerated) grants are folded newest-first
 * (quantities sum, newest snapshot wins, losers become `merged`) and the
 * survivor is re-keyed into the current scope. Returns undefined when the
 * visitor has no open cart anywhere in scope — creation is the caller's call.
 * Shared by getOrCreateCart (creates) and getOpenCart (read-only). */
async function resolveScopeCart(
  grant: typeof schema.shareGrants.$inferSelect,
  visitorId: string,
): Promise<CartRow | undefined> {
  const db = getDb();
  const ancestors = await ancestorGrantIds(grant);
  const scopeIds = [...new Set([grant.id, ...ancestors])];
  const open = await db
    .select()
    .from(schema.carts)
    .where(
      and(eq(schema.carts.visitorId, visitorId), eq(schema.carts.status, "open"), inArray(schema.carts.grantId, scopeIds)),
    )
    .orderBy(desc(schema.carts.updatedAt), desc(schema.carts.createdAt), desc(schema.carts.id));
  if (!open.length) return undefined;
  const [target, ...rest] = open;
  if (rest.length) await foldInto(target, rest);
  if (target.grantId === grant.id) return target;
  // Adopt the surviving cart into the current (regenerated) grant scope.
  return (
    await db
      .update(schema.carts)
      .set({ grantId: grant.id, updatedAt: new Date() })
      .where(eq(schema.carts.id, target.id))
      .returning()
  )[0];
}

/** Fetch or create the visitor's OPEN cart for a gallery, merging older open
 * carts found under the same scope or under ancestor (regenerated) grants.
 * `currency` (ISO 4217) locks the cart on creation; later adds must match. */
export async function getOrCreateCart(params: {
  organizationId: string;
  grantId: string;
  visitorId: string;
  currency: string;
}): Promise<CartResult<CartRow>> {
  const currency = normalizeCurrency(params.currency);
  if (!currency) return { ok: false, error: "invalid_currency" };
  const visitorId = params.visitorId.trim();
  if (!visitorId || visitorId.length > 128) return { ok: false, error: "not_found" };

  const grant = await activeGalleryGrant(params.organizationId, params.grantId);
  if (!grant.ok) return grant;

  const db = getDb();
  let cart = await resolveScopeCart(grant.value, visitorId);
  if (!cart) {
    const id = crypto.randomUUID();
    try {
      cart = (
        await db
          .insert(schema.carts)
          .values({ id, organizationId: params.organizationId, grantId: grant.value.id, visitorId, currency })
          .returning()
      )[0];
    } catch {
      // Lost a create race on the partial unique index cart_open_unique —
      // take the winner.
      cart = (
        await db
          .select()
          .from(schema.carts)
          .where(
            and(
              eq(schema.carts.grantId, grant.value.id),
              eq(schema.carts.visitorId, visitorId),
              eq(schema.carts.status, "open"),
            ),
          )
          .limit(1)
      )[0];
    }
  }
  if (!cart) return { ok: false, error: "not_found" };
  if (cart.currency !== currency) return { ok: false, error: "currency_mismatch" };
  return { ok: true, value: cart };
}

/** The visitor's open cart with its lines, for the drawer. Read-only — but it
 * performs the same merge-on-re-entry as getOrCreateCart so a cart saved
 * under an ancestor (regenerated) grant is still found and re-keyed. */
export async function getOpenCart(
  organizationId: string,
  grantId: string,
  visitorId: string,
): Promise<CartResult<{ cart: CartRow; items: CartItemRow[] }>> {
  const grant = await activeGalleryGrant(organizationId, grantId);
  if (!grant.ok) return grant;
  const cart = await resolveScopeCart(grant.value, visitorId.trim());
  if (!cart || cart.organizationId !== organizationId) return { ok: false, error: "not_found" };
  const items = await getDb()
    .select()
    .from(schema.cartItems)
    .where(eq(schema.cartItems.cartId, cart.id))
    .orderBy(asc(schema.cartItems.createdAt), asc(schema.cartItems.id));
  return { ok: true, value: { cart, items } };
}

/** Org-scoped cart fetch for checkout/recovery (C2 3/7, 5/7). */
export async function getCartById(
  organizationId: string,
  cartId: string,
): Promise<CartResult<{ cart: CartRow; items: CartItemRow[] }>> {
  const cart = (
    await getDb()
      .select()
      .from(schema.carts)
      .where(and(eq(schema.carts.id, cartId), eq(schema.carts.organizationId, organizationId)))
      .limit(1)
  )[0];
  if (!cart) return { ok: false, error: "not_found" };
  const items = await getDb().select().from(schema.cartItems).where(eq(schema.cartItems.cartId, cart.id));
  return { ok: true, value: { cart, items } };
}

/** Add a line (catalog snapshot supplied by the caller — the price-list repo,
 * C1 1/7, resolves variant → current name/price/currency). Same variant in
 * the same cart merges quantities. */
export async function addCartItem(params: {
  organizationId: string;
  grantId: string;
  visitorId: string;
  variantId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  currency: string;
}): Promise<CartResult<CartRow>> {
  const variantId = params.variantId.trim();
  if (!variantId || variantId.length > 128) return { ok: false, error: "invalid_variant" };
  const name = params.name.trim().slice(0, 200);
  if (!name) return { ok: false, error: "invalid_name" };
  if (!Number.isSafeInteger(params.unitPriceCents) || params.unitPriceCents < 0) return { ok: false, error: "invalid_amount" };
  if (!Number.isSafeInteger(params.quantity) || params.quantity < 1 || params.quantity > MAX_ITEM_QUANTITY) {
    return { ok: false, error: "invalid_quantity" };
  }

  const cart = await getOrCreateCart({
    organizationId: params.organizationId,
    grantId: params.grantId,
    visitorId: params.visitorId,
    currency: params.currency,
  });
  if (!cart.ok) return cart;

  const db = getDb();
  const existing = (
    await db
      .select()
      .from(schema.cartItems)
      .where(and(eq(schema.cartItems.cartId, cart.value.id), eq(schema.cartItems.variantId, variantId)))
      .limit(1)
  )[0];
  if (existing) {
    const quantity = existing.quantity + params.quantity;
    if (quantity > MAX_ITEM_QUANTITY) return { ok: false, error: "invalid_quantity" };
    await db.update(schema.cartItems).set({ quantity, updatedAt: new Date() }).where(eq(schema.cartItems.id, existing.id));
  } else {
    await db.insert(schema.cartItems).values({
      id: crypto.randomUUID(),
      cartId: cart.value.id,
      variantId,
      name,
      unitPriceCents: params.unitPriceCents,
      quantity: params.quantity,
    });
  }
  await db.update(schema.carts).set({ updatedAt: new Date() }).where(eq(schema.carts.id, cart.value.id));
  return { ok: true, value: cart.value };
}

/** Set a line's quantity; 0 removes it. */
export async function setCartItemQuantity(params: {
  organizationId: string;
  cartId: string;
  variantId: string;
  quantity: number;
}): Promise<CartResult<true>> {
  if (!Number.isSafeInteger(params.quantity) || params.quantity < 0 || params.quantity > MAX_ITEM_QUANTITY) {
    return { ok: false, error: "invalid_quantity" };
  }
  const cart = await getCartById(params.organizationId, params.cartId);
  if (!cart.ok) return cart;
  if (cart.value.cart.status !== "open") return { ok: false, error: "cart_not_open" };
  const db = getDb();
  const existing = (
    await db
      .select()
      .from(schema.cartItems)
      .where(and(eq(schema.cartItems.cartId, params.cartId), eq(schema.cartItems.variantId, params.variantId)))
      .limit(1)
  )[0];
  if (!existing) return { ok: false, error: "not_found" };
  if (params.quantity === 0) {
    await db.delete(schema.cartItems).where(eq(schema.cartItems.id, existing.id));
  } else {
    await db.update(schema.cartItems).set({ quantity: params.quantity, updatedAt: new Date() }).where(eq(schema.cartItems.id, existing.id));
  }
  await db.update(schema.carts).set({ updatedAt: new Date() }).where(eq(schema.carts.id, params.cartId));
  return { ok: true, value: true };
}

/** Store the drawer's coupon code (validated later, at checkout). Null clears. */
export async function setCartCoupon(params: {
  organizationId: string;
  cartId: string;
  couponCode: string | null;
}): Promise<CartResult<true>> {
  const cart = await getCartById(params.organizationId, params.cartId);
  if (!cart.ok) return cart;
  if (cart.value.cart.status !== "open") return { ok: false, error: "cart_not_open" };
  const code = params.couponCode === null ? null : params.couponCode.trim().slice(0, 64) || null;
  await getDb().update(schema.carts).set({ couponCode: code, updatedAt: new Date() }).where(eq(schema.carts.id, params.cartId));
  return { ok: true, value: true };
}

/** Monotonic state transition: only `open` may move, only to a terminal
 * state; same-state is an idempotent no-op; terminal → anything fails. */
export async function setCartStatus(params: {
  organizationId: string;
  cartId: string;
  status: CartStatus;
}): Promise<CartResult<CartStatus>> {
  if (!CART_STATES.includes(params.status)) return { ok: false, error: "invalid_transition" };
  const cart = await getCartById(params.organizationId, params.cartId);
  if (!cart.ok) return cart;
  const current = cart.value.cart.status as CartStatus;
  if (current === params.status) return { ok: true, value: current };
  if (current !== "open" || !CART_TERMINAL.includes(params.status)) return { ok: false, error: "invalid_transition" };
  await getDb().update(schema.carts).set({ status: params.status, updatedAt: new Date() }).where(eq(schema.carts.id, params.cartId));
  return { ok: true, value: params.status };
}

/** Sum of unit_price_cents × quantity over the cart's lines. */
export function subtotalCents(items: CartItemRow[]): number {
  return items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
}
