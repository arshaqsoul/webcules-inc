/* Checkout session service (WEB-168 / Linear WEB-356, Commerce C2 3/7) —
 * turns an OPEN server-side cart into a Stripe-hosted Checkout Session.
 *
 * Three rules the parent story (WEB-281/WEB-45) settled and this file enforces:
 *
 *  1. LIVE REPRICING. Cart lines snapshot name+price at add time so the drawer
 *     can still render after catalog edits — but the session is priced from
 *     the catalog AS IT IS NOW: the gallery's active price list, the variant's
 *     current price and name. Lines whose variant/product/price list is gone
 *     or inactive block checkout with an itemized report (the drawer shows
 *     "no longer available" and lets the buyer remove them — WEB-170's
 *     design); checkout never silently drops or silently overcharges a line.
 *
 *  2. IDEMPOTENCY. The idempotency key is derived deterministically from the
 *     repriced contents (currency + subtotal + hash over variant:qty:price),
 *     so double-clicking "checkout", retrying a failed create, or replaying
 *     after a redirect returns the SAME pending session instead of minting
 *     another. The same key rides the Stripe request as its Idempotency-Key
 *     header (HTTP-level replay safety), and the UNIQUE index on
 *     checkout_session.idempotency_key is the D1 backstop for create races.
 *     Any catalog or quantity change re-keys → a fresh session is correct.
 *     Pending sessions are reused for 23h (Stripe expires payment-mode
 *     sessions at 24h).
 *
 *  3. NO APPLICATION FEE — DIRECT CHARGE ONLY. The session is created ON the
 *     studio's CONNECTED account (platform key + Stripe-Account header via
 *     onAccount), exactly like booking checkout (WEB-352). Money, Stripe fees,
 *     refunds and disputes all live in the studio's Stripe. There is
 *     deliberately NO fallback to the platform account and no
 *     application_fee_amount / transfer_data / on_behalf_of anywhere — pinned
 *     by tests/unit/direct-charges.test.ts.
 *
 * The cart itself stays `open` until the webhook (C2 4/7) flips it to
 * `converted`; this service never mutates cart state.
 */
import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";

import { getDb } from "../db";
import * as schema from "../db-schema";
import { activePriceListForGrant, getPriceListDetail } from "../commerce";
import { chargeAccountId, onAccount } from "../connect";
import { getStudioProfile } from "./studios";
import { getCartById, type CartItemRow } from "./carts";

export type CheckoutError =
  | "not_found" // cart missing or another org's — no existence leak
  | "cart_not_open" // terminal cart (converted/cancelled/…) cannot check out
  | "cart_empty"
  | "items_unavailable" // + per-line report for the drawer
  | "currency_mismatch" // cart vs price list, or vs the studio's charge currency
  | "studio_not_payable" // no ACTIVE connected account — never a platform fallback
  | "stripe_failed" // no key configured, or Stripe refused the create
  | "preview_refused"; // WEB-277: a store preview can never mint an order path

/** Why a cart line can no longer be sold, for the drawer's strikethrough row. */
export type UnavailableLine = {
  variantId: string;
  /** The line's add-time snapshot name (what the buyer sees in their cart). */
  name: string;
  reason: "no_price_list" | "variant_missing" | "variant_inactive" | "product_inactive";
};

/** A cart line re-priced from the live catalog. */
export type RepricedLine = {
  variantId: string;
  /** Current catalog name (may differ from the add-time snapshot). */
  name: string;
  /** Current catalog price — the snapshot price is never charged. */
  unitPriceCents: number;
  quantity: number;
};

export type RepricedCart = {
  cartId: string;
  grantId: string;
  currency: string;
  lines: RepricedLine[];
  subtotalCents: number;
};

export type CheckoutSessionResult =
  | { ok: true; url: string; sessionId: string; stripeAccountId: string; subtotalCents: number; currency: string; reused: boolean }
  | ({ ok: false; error: CheckoutError } & { unavailable?: UnavailableLine[] });

/** Minimal Stripe surface this service needs — the real client satisfies it;
 * tests inject a fake so no network is ever touched. */
export interface CheckoutStripe {
  checkout: {
    sessions: {
      create(
        params: Stripe.Checkout.SessionCreateParams,
        options?: Stripe.RequestOptions,
      ): Promise<Stripe.Checkout.Session>;
    };
  };
}

/** Stripe expires payment-mode sessions 24h after creation; stop reusing a
 * pending row an hour before that so a buyer is never sent to a dead URL. */
export const SESSION_REUSE_MS = 23 * 60 * 60 * 1000;

/** metadata.kind on every store-checkout session — the webhook (C2 4/7)
 * routes on it, same convention as billing's kind: "plan_checkout". */
export const CHECKOUT_METADATA_KIND = "store_checkout";

async function digest(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Deterministic idempotency key over the REPRICED contents: same cart state →
 * same key (reuse), any change → new key (new session). */
export async function checkoutIdempotencyKey(cart: RepricedCart): Promise<string> {
  const lines = [...cart.lines]
    .sort((a, b) => (a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0))
    .map((l) => `${l.variantId}:${l.quantity}:${l.unitPriceCents}`)
    .join("|");
  const hash = await digest(`${cart.cartId}~${lines}`);
  return `store_checkout:${cart.cartId}:${cart.currency}:${cart.subtotalCents}:${hash.slice(0, 32)}`;
}

/** Re-price an OPEN cart from the live catalog (rule 1). Public: the drawer's
 * "order summary" needs the same numbers the buyer will actually be charged. */
export async function repriceCart(organizationId: string, cartId: string): Promise<
  | { ok: true; value: RepricedCart }
  | ({ ok: false; error: "not_found" | "cart_not_open" | "cart_empty" | "currency_mismatch" | "items_unavailable" } & { unavailable?: UnavailableLine[] })
> {
  const cart = await getCartById(organizationId, cartId);
  if (!cart.ok) return { ok: false, error: "not_found" };
  if (cart.value.cart.status !== "open") return { ok: false, error: "cart_not_open" };
  const items: CartItemRow[] = cart.value.items;
  if (!items.length) return { ok: false, error: "cart_empty" };

  // The gallery's CURRENTLY active price list is the only valid price source.
  const active = await activePriceListForGrant(cart.value.cart.grantId);
  if (!active) {
    return {
      ok: false,
      error: "items_unavailable",
      unavailable: items.map((i) => ({ variantId: i.variantId, name: i.name, reason: "no_price_list" as const })),
    };
  }
  if (active.currency !== cart.value.cart.currency) return { ok: false, error: "currency_mismatch" };

  // Classify against the UNfiltered detail (inactive products/variants stay
  // visible here) so the drawer gets the precise reason.
  const detail = await getPriceListDetail(active.organizationId, active.id);
  if (!detail) return { ok: false, error: "not_found" };
  const byVariant = new Map<string, { productActive: boolean; variantActive: boolean; name: string; priceCents: number }>();
  for (const product of detail.products) {
    for (const variant of product.variants) {
      byVariant.set(variant.id, { productActive: product.active, variantActive: variant.active, name: variant.name, priceCents: variant.priceCents });
    }
  }

  const unavailable: UnavailableLine[] = [];
  const lines: RepricedLine[] = [];
  for (const item of items) {
    const v = byVariant.get(item.variantId);
    if (!v) {
      unavailable.push({ variantId: item.variantId, name: item.name, reason: "variant_missing" });
    } else if (!v.productActive) {
      unavailable.push({ variantId: item.variantId, name: item.name, reason: "product_inactive" });
    } else if (!v.variantActive) {
      unavailable.push({ variantId: item.variantId, name: item.name, reason: "variant_inactive" });
    } else {
      lines.push({ variantId: item.variantId, name: v.name, unitPriceCents: v.priceCents, quantity: item.quantity });
    }
  }
  if (unavailable.length) return { ok: false, error: "items_unavailable", unavailable };

  return {
    ok: true,
    value: {
      cartId,
      grantId: cart.value.cart.grantId,
      currency: cart.value.cart.currency,
      lines,
      subtotalCents: lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0),
    },
  };
}

/** Mint (or replay) the Stripe Checkout Session for a cart (rules 1–3).
 *
 * `galleryUrl` is the public URL of the gallery the buyer is shopping (the
 * grant stores only a token hash, so the serving route supplies it) — the
 * session's success/cancel URLs point back at it.
 *
 * `stripe` is injectable for tests; production resolves the real client. */
export async function createCheckoutSession(params: {
  organizationId: string;
  cartId: string;
  galleryUrl: string;
  stripe?: CheckoutStripe;
  /** WEB-277: preview sessions never reach Stripe — refused before repricing. */
  preview?: boolean;
}): Promise<CheckoutSessionResult> {
  if (params.preview) return { ok: false, error: "preview_refused" };
  const repriced = await repriceCart(params.organizationId, params.cartId);
  if (!repriced.ok) return repriced;

  // Rule 3: client money is charged DIRECTLY on the studio's connected
  // account. No active account → refuse; there is no platform fallback.
  const profile = await getStudioProfile(params.organizationId);
  const account = chargeAccountId(profile);
  if (!account) return { ok: false, error: "studio_not_payable" };

  // The studio's charge currency (its Stripe account's default) is the only
  // currency its checkout sessions can collect.
  const chargeCurrency = (profile?.paymentCurrency ?? "usd").toUpperCase();
  if (chargeCurrency !== repriced.value.currency) return { ok: false, error: "currency_mismatch" };

  const idempotencyKey = await checkoutIdempotencyKey(repriced.value);

  // Rule 2: a still-live pending session for the same repriced contents is
  // replayed — no second Stripe call, no second row.
  const db = getDb();
  const existing = (
    await db
      .select()
      .from(schema.checkoutSessions)
      .where(and(eq(schema.checkoutSessions.idempotencyKey, idempotencyKey), eq(schema.checkoutSessions.status, "pending")))
      .limit(1)
  )[0];
  if (existing && Date.now() - existing.createdAt.getTime() < SESSION_REUSE_MS) {
    return {
      ok: true,
      url: existing.url,
      sessionId: existing.stripeSessionId,
      stripeAccountId: existing.stripeAccountId,
      subtotalCents: existing.subtotalCents,
      currency: existing.currency,
      reused: true,
    };
  }

  const stripe = params.stripe ?? (await (await import("../stripe")).getStripe());
  if (!stripe) return { ok: false, error: "stripe_failed" };

  // A pending row for this key that aged past the reuse window is dead weight
  // (Stripe already expired the session) — flip it to `expired` so the fresh
  // pending insert below is free to take the key. History keeps the row.
  await db
    .update(schema.checkoutSessions)
    .set({ status: "expired" })
    .where(and(eq(schema.checkoutSessions.idempotencyKey, idempotencyKey), eq(schema.checkoutSessions.status, "pending")));

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: repriced.value.lines.map((line) => ({
        quantity: line.quantity,
        price_data: {
          currency: repriced.value.currency.toLowerCase(),
          unit_amount: line.unitPriceCents,
          product_data: { name: line.name },
        },
      })),
      // The webhook (C2 4/7) routes carts/orders on these.
      metadata: {
        kind: CHECKOUT_METADATA_KIND,
        cartId: repriced.value.cartId,
        organizationId: params.organizationId,
        grantId: repriced.value.grantId,
      },
      payment_intent_data: { metadata: { kind: CHECKOUT_METADATA_KIND, cartId: repriced.value.cartId, organizationId: params.organizationId } },
      success_url: `${params.galleryUrl}?checkout=success`,
      cancel_url: `${params.galleryUrl}?checkout=cancelled`,
      // No application_fee_amount, no transfer_data, no on_behalf_of — the
      // studio keeps 100% (0% commission, WEB-351/352 ruling).
    },
    // Direct charge ON the studio's account + HTTP replay safety (rule 2+3).
    { ...onAccount(account), idempotencyKey },
  );
  if (!session.url) return { ok: false, error: "stripe_failed" };

  const id = crypto.randomUUID();
  try {
    await db.insert(schema.checkoutSessions).values({
      id,
      organizationId: params.organizationId,
      cartId: repriced.value.cartId,
      stripeSessionId: session.id,
      stripeAccountId: account,
      url: session.url,
      currency: repriced.value.currency,
      subtotalCents: repriced.value.subtotalCents,
      idempotencyKey,
    });
  } catch {
    // Lost a create race on the UNIQUE idempotency_key — return the winner.
    const winner = (
      await db
        .select()
        .from(schema.checkoutSessions)
        .where(and(eq(schema.checkoutSessions.idempotencyKey, idempotencyKey), eq(schema.checkoutSessions.status, "pending")))
        .limit(1)
    )[0];
    if (!winner) return { ok: false, error: "stripe_failed" };
    return {
      ok: true,
      url: winner.url,
      sessionId: winner.stripeSessionId,
      stripeAccountId: winner.stripeAccountId,
      subtotalCents: winner.subtotalCents,
      currency: winner.currency,
      reused: true,
    };
  }

  return {
    ok: true,
    url: session.url,
    sessionId: session.id,
    stripeAccountId: account,
    subtotalCents: repriced.value.subtotalCents,
    currency: repriced.value.currency,
    reused: false,
  };
}

/** pending → completed | expired for the webhook (C2 4/7). Same-state is an
 * idempotent no-op; terminal states never change again. */
export async function setCheckoutSessionStatus(params: {
  stripeSessionId: string;
  status: "completed" | "expired";
}): Promise<boolean> {
  const res = await getDb()
    .update(schema.checkoutSessions)
    .set({ status: params.status })
    .where(and(eq(schema.checkoutSessions.stripeSessionId, params.stripeSessionId), eq(schema.checkoutSessions.status, "pending")))
    .returning({ id: schema.checkoutSessions.id });
  if (res.length > 0) return true;
  // Idempotent replay: the row is already in the requested terminal state.
  const row = (
    await getDb()
      .select({ status: schema.checkoutSessions.status })
      .from(schema.checkoutSessions)
      .where(eq(schema.checkoutSessions.stripeSessionId, params.stripeSessionId))
      .limit(1)
  )[0];
  return row?.status === params.status;
}
