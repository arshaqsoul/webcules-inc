/* WEB-168 (Commerce C2 3/7) — the checkout session service: live repricing
 * from the catalog, idempotent session creation (DB + Stripe key), and the
 * direct-charge contract (studio account only, no application fee). Runs
 * against the real migrations (0069 + 0070) via the isolated per-file D1;
 * Stripe is a recording fake so no network is touched. */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type Stripe from "stripe";

import { getDb, schema } from "@/lib/db";
import {
  attachPriceListToGrant,
  createPriceList,
  createProduct,
  createProductVariant,
} from "@/lib/commerce";
import { addCartItem, setCartStatus } from "@/lib/repos/carts";
import {
  CHECKOUT_METADATA_KIND,
  SESSION_REUSE_MS,
  checkoutIdempotencyKey,
  createCheckoutSession,
  repriceCart,
  setCheckoutSessionStatus,
  type CheckoutSessionResult,
  type CheckoutStripe,
} from "@/lib/repos/checkout";
import { resetDb } from "../helpers/db";
import { seedAsset, seedProject, seedStudio } from "../helpers/seed";

type Ok<V> = { ok: true; value: V } | { ok: false; error: string };

function okValue<V>(res: Ok<V>): V {
  if (!res.ok) throw new Error(`expected ok, got ${res.error}`);
  return res.value;
}
function okId(res: Ok<{ id: string }>): string {
  return okValue(res).id;
}


/** await createCheckoutSession and unwrap (tests already assert failures separately). */
async function checkoutOk(params: Parameters<typeof createCheckoutSession>[0]): Promise<Extract<CheckoutSessionResult, { ok: true }>> {
  const res = await createCheckoutSession(params);
  if (!res.ok) throw new Error(res.error);
  return res;
}

/** Recording fake Stripe: returns distinct sessions per create and captures
 * every (params, options) pair for assertions. */
function fakeStripe() {
  const creates: Array<{ params: Stripe.Checkout.SessionCreateParams; options?: Stripe.RequestOptions }> = [];
  let n = 0;
  const stripe: CheckoutStripe = {
    checkout: {
      sessions: {
        create: async (params, options) => {
          creates.push({ params, options });
          n += 1;
          return { id: `cs_test_${n}`, url: `https://checkout.stripe.com/c/pay/test_${n}` } as Stripe.Checkout.Session;
        },
      },
    },
  };
  return { stripe, creates, get calls() { return creates.length; } };
}

let grantId = "";

/** A payee-ready studio: lite plan (store enabled), project, gallery grant,
 * price list with one product/variant, and an ACTIVE connected account
 * charging in USD. `variantId`/`priceListId` are exposed for mutations. */
async function seedStore() {
  const studio = await seedStudio({ plan: "lite" });
  const projectId = await seedProject(studio.organizationId);
  const assetId = await seedAsset({ organizationId: studio.organizationId, projectId, kind: "image", filename: "a.jpg", status: "approved" });
  const grant = crypto.randomUUID();
  await getDb().insert(schema.shareGrants).values({
    id: grant, organizationId: studio.organizationId, projectId, clientEmail: "client@test.test",
    tokenHash: `hash-${grant}`, status: "active",
  });
  grantId = grant;

  const priceListId = okId(await createPriceList(studio.organizationId, { name: "Store", currency: "usd" }));
  const productId = okId(await createProduct(studio.organizationId, { priceListId, kind: "digital", name: "Single photo" }));
  const variantId = okId(await createProductVariant(studio.organizationId, { productId, name: "Hi-res JPEG", costCents: 0, priceCents: 1500 }));
  await okValue(await attachPriceListToGrant(studio.organizationId, { grantId: grant, priceListId }));

  // Connected + active → chargeable (WEB-352 direct-charge precondition).
  await getDb()
    .update(schema.studioProfiles)
    .set({ stripeAccountId: "acct_test_studio", stripeConnectState: "active", paymentCurrency: "usd" })
    .where(eq(schema.studioProfiles.organizationId, studio.organizationId));

  return { studio, priceListId, productId, variantId };
}

async function openCartId(organizationId: string, variantId: string, price = 1500, quantity = 1) {
  const res = await addCartItem({ organizationId, grantId, visitorId: "visitor-a", variantId, name: "Snapshot", unitPriceCents: price, quantity, currency: "USD" });
  return okValue(res).id;
}

beforeEach(async () => {
  await resetDb();
});

describe("live repricing (WEB-168 rule 1)", () => {
  it("charges the CURRENT catalog price and name, not the add-time snapshot", async () => {
    const { studio, variantId } = await seedStore();
    // Added at 1500 when the catalog said 1500; the studio then repriced to 1800
    // and renamed the variant — the session must reflect the catalog NOW.
    const cartId = await openCartId(studio.organizationId, variantId, 1500);
    await getDb().update(schema.productVariants).set({ name: "Hi-res JPEG (2027)", priceCents: 1800 }).where(eq(schema.productVariants.id, variantId));

    const repriced = await repriceCart(studio.organizationId, cartId);
    expect(repriced.ok).toBe(true);
    if (repriced.ok) {
      expect(repriced.value.lines).toEqual([{ variantId, name: "Hi-res JPEG (2027)", unitPriceCents: 1800, quantity: 1 }]);
      expect(repriced.value.subtotalCents).toBe(1800);
    }

    const { stripe, creates } = fakeStripe();
    const res = await createCheckoutSession({ organizationId: studio.organizationId, cartId, galleryUrl: "https://gallery.example/g/tok", stripe });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);
    expect(res.subtotalCents).toBe(1800);
    expect(creates).toHaveLength(1);
    const items = creates[0].params.line_items as Stripe.Checkout.SessionCreateParams.LineItem[];
    expect(items).toEqual([{ quantity: 1, price_data: { currency: "usd", unit_amount: 1800, product_data: { name: "Hi-res JPEG (2027)" } } }]);
  });

  it("reports unavailable lines itemized by reason and blocks checkout", async () => {
    const { studio, variantId } = await seedStore();
    const cartId = await openCartId(studio.organizationId, variantId);

    await getDb().update(schema.productVariants).set({ active: false }).where(eq(schema.productVariants.id, variantId));
    expect(await repriceCart(studio.organizationId, cartId)).toEqual({
      ok: false,
      error: "items_unavailable",
      unavailable: [{ variantId, name: "Snapshot", reason: "variant_inactive" }],
    });
    await getDb().update(schema.productVariants).set({ active: true }).where(eq(schema.productVariants.id, variantId));

    await getDb().update(schema.products).set({ active: false }).where(eq(schema.products.id, (await getDb().select({ id: schema.productVariants.productId }).from(schema.productVariants).where(eq(schema.productVariants.id, variantId)))[0].id));
    expect(await repriceCart(studio.organizationId, cartId)).toEqual({
      ok: false,
      error: "items_unavailable",
      unavailable: [{ variantId, name: "Snapshot", reason: "product_inactive" }],
    });

    await getDb().delete(schema.productVariants).where(eq(schema.productVariants.id, variantId));
    expect(await repriceCart(studio.organizationId, cartId)).toEqual({
      ok: false,
      error: "items_unavailable",
      unavailable: [{ variantId, name: "Snapshot", reason: "variant_missing" }],
    });

    // Nothing above ever minted a Stripe session.
    const { stripe, creates } = fakeStripe();
    const res = await createCheckoutSession({ organizationId: studio.organizationId, cartId, galleryUrl: "https://g.example/g/tok", stripe });
    expect(res).toMatchObject({ ok: false, error: "items_unavailable" });
    expect(creates).toHaveLength(0);
  });

  it("refuses when the gallery has no active price list, a non-open cart, or an empty cart", async () => {
    const { studio, variantId } = await seedStore();
    const cartId = await openCartId(studio.organizationId, variantId);

    // Price list detached → every line is no_price_list.
    await getDb().update(schema.priceListGallery).set({ detachedAt: new Date() }).where(eq(schema.priceListGallery.grantId, grantId));
    expect(await repriceCart(studio.organizationId, cartId)).toMatchObject({
      ok: false,
      error: "items_unavailable",
      unavailable: [{ reason: "no_price_list" }],
    });
    // (re-attach for the rest of the case)
    await getDb().update(schema.priceListGallery).set({ detachedAt: null }).where(eq(schema.priceListGallery.grantId, grantId));

    await setCartStatus({ organizationId: studio.organizationId, cartId, status: "converted" });
    expect(await repriceCart(studio.organizationId, cartId)).toEqual({ ok: false, error: "cart_not_open" });

    const empty = await addCartItem({ organizationId: studio.organizationId, grantId, visitorId: "visitor-b", variantId, name: "S", unitPriceCents: 100, quantity: 1, currency: "USD" });
    const emptyCartId = okValue(empty).id;
    await getDb().delete(schema.cartItems).where(eq(schema.cartItems.cartId, emptyCartId));
    expect(await repriceCart(studio.organizationId, emptyCartId)).toEqual({ ok: false, error: "cart_empty" });
  });

  it("is org-scoped: another org's cart is simply not_found", async () => {
    const { studio, variantId } = await seedStore();
    const cartId = await openCartId(studio.organizationId, variantId);
    const other = await seedStudio({ plan: "lite" });
    expect(await repriceCart(other.organizationId, cartId)).toEqual({ ok: false, error: "not_found" });
  });
});

describe("idempotency (WEB-168 rule 2)", () => {
  it("replays the same pending session for unchanged contents — one Stripe create", async () => {
    const { studio, variantId } = await seedStore();
    const cartId = await openCartId(studio.organizationId, variantId, 1500, 2);
    const { stripe, creates } = fakeStripe();

    const first = await checkoutOk({ organizationId: studio.organizationId, cartId, galleryUrl: "https://g.example/g/tok", stripe });
    expect(first.reused).toBe(false);
    const second = await checkoutOk({ organizationId: studio.organizationId, cartId, galleryUrl: "https://g.example/g/tok", stripe });
    expect(second).toMatchObject({ reused: true, url: first.url, sessionId: first.sessionId });
    expect(creates).toHaveLength(1);

    // The same deterministic key rode the Stripe call as its Idempotency-Key.
    expect(creates[0].options?.idempotencyKey).toBeDefined();
    const repriced = okValue(await repriceCart(studio.organizationId, cartId));
    expect(creates[0].options?.idempotencyKey).toBe(await checkoutIdempotencyKey(repriced));

    // And exactly one row exists.
    const rows = await getDb().select().from(schema.checkoutSessions).where(eq(schema.checkoutSessions.cartId, cartId));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");
  });

  it("re-keys when contents change: a price bump or quantity edit mints a fresh session", async () => {
    const { studio, variantId } = await seedStore();
    const cartId = await openCartId(studio.organizationId, variantId, 1500, 1);
    const { stripe, creates } = fakeStripe();

    const first = await checkoutOk({ organizationId: studio.organizationId, cartId, galleryUrl: "https://g.example/g/tok", stripe });
    // Live repricing: the catalog price moves to 2000 → new contents → new key.
    await getDb().update(schema.productVariants).set({ priceCents: 2000 }).where(eq(schema.productVariants.id, variantId));
    const second = await checkoutOk({ organizationId: studio.organizationId, cartId, galleryUrl: "https://g.example/g/tok", stripe });
    expect(second.reused).toBe(false);
    expect(second.url).not.toBe(first.url);
    expect(second.subtotalCents).toBe(2000);
    expect(creates).toHaveLength(2);
    expect(creates[0].options?.idempotencyKey).not.toBe(creates[1].options?.idempotencyKey);
  });

  it("stops reusing a pending session older than the Stripe expiry window", async () => {
    const { studio, variantId } = await seedStore();
    const cartId = await openCartId(studio.organizationId, variantId, 1500, 1);
    const { stripe, creates } = fakeStripe();
    const first = await checkoutOk({ organizationId: studio.organizationId, cartId, galleryUrl: "https://g.example/g/tok", stripe });

    // Age the row past the reuse window (Stripe sessions die at 24h).
    await getDb()
      .update(schema.checkoutSessions)
      .set({ createdAt: new Date(Date.now() - SESSION_REUSE_MS - 60_000) })
      .where(eq(schema.checkoutSessions.stripeSessionId, first.sessionId));

    const second = await checkoutOk({ organizationId: studio.organizationId, cartId, galleryUrl: "https://g.example/g/tok", stripe });
    expect(second.reused).toBe(false);
    expect(second.url).not.toBe(first.url);
    expect(creates).toHaveLength(2);
  });

  it("survives a create race on the unique key by returning the winner", async () => {
    const { studio, variantId } = await seedStore();
    const cartId = await openCartId(studio.organizationId, variantId, 1500, 1);
    const { stripe } = fakeStripe();
    const first = await checkoutOk({ organizationId: studio.organizationId, cartId, galleryUrl: "https://g.example/g/tok", stripe });

    // Simulate the loser: same key already inserted by a concurrent request.
    await getDb().delete(schema.checkoutSessions).where(eq(schema.checkoutSessions.stripeSessionId, first.sessionId));
    const repriced = okValue(await repriceCart(studio.organizationId, cartId));
    await getDb().insert(schema.checkoutSessions).values({
      id: crypto.randomUUID(), organizationId: studio.organizationId, cartId,
      stripeSessionId: "cs_test_raced", stripeAccountId: "acct_test_studio",
      url: "https://checkout.stripe.com/c/pay/raced", currency: "USD",
      subtotalCents: repriced.subtotalCents, idempotencyKey: await checkoutIdempotencyKey(repriced),
    });

    const res = await checkoutOk({ organizationId: studio.organizationId, cartId, galleryUrl: "https://g.example/g/tok", stripe });
    expect(res).toMatchObject({ reused: true, url: "https://checkout.stripe.com/c/pay/raced", sessionId: "cs_test_raced" });
  });

  it("the webhook flip pending→terminal is idempotent and one-way", async () => {
    expect(await setCheckoutSessionStatus({ stripeSessionId: "cs_none", status: "completed" })).toBe(false);
    const { studio, variantId } = await seedStore();
    const cartId = await openCartId(studio.organizationId, variantId, 1500, 1);
    const { stripe } = fakeStripe();
    const first = await checkoutOk({ organizationId: studio.organizationId, cartId, galleryUrl: "https://g.example/g/tok", stripe });

    expect(await setCheckoutSessionStatus({ stripeSessionId: first.sessionId, status: "completed" })).toBe(true);
    expect(await setCheckoutSessionStatus({ stripeSessionId: first.sessionId, status: "completed" })).toBe(true);
    expect(await setCheckoutSessionStatus({ stripeSessionId: first.sessionId, status: "expired" })).toBe(false);
    const row = (await getDb().select().from(schema.checkoutSessions).where(eq(schema.checkoutSessions.stripeSessionId, first.sessionId)))[0];
    expect(row.status).toBe("completed");
  });
});

describe("direct charge, no application fee (WEB-168 rule 3)", () => {
  it("creates the session ON the studio's connected account with zero fee fields", async () => {
    const { studio, variantId } = await seedStore();
    const cartId = await openCartId(studio.organizationId, variantId, 1500, 1);
    const { stripe, creates } = fakeStripe();
    const res = await checkoutOk({ organizationId: studio.organizationId, cartId, galleryUrl: "https://gallery.example/g/tok", stripe });

    expect(res.stripeAccountId).toBe("acct_test_studio");
    expect(creates).toHaveLength(1);
    // Runs on the studio's account (Stripe-Account header) with an idempotency key.
    expect(creates[0].options).toMatchObject({ stripeAccount: "acct_test_studio" });
    const params = creates[0].params;
    expect(params.mode).toBe("payment");
    // 0% commission: none of the fee-taking fields may appear.
    expect("application_fee_amount" in params).toBe(false);
    expect(params.payment_intent_data && "application_fee_amount" in params.payment_intent_data).toBe(false);
    expect(JSON.stringify(params)).not.toMatch(/transfer_data|on_behalf_of|application_fee/);
    // Webhook routing metadata + round-trip URLs back to the gallery.
    expect(params.metadata).toMatchObject({ kind: CHECKOUT_METADATA_KIND, cartId, organizationId: studio.organizationId, grantId });
    expect(params.success_url).toBe("https://gallery.example/g/tok?checkout=success");
    expect(params.cancel_url).toBe("https://gallery.example/g/tok?checkout=cancelled");
  });

  it("refuses studios without an ACTIVE connected account — never the platform", async () => {
    const { studio, variantId } = await seedStore();
    const cartId = await openCartId(studio.organizationId, variantId, 1500, 1);
    const { stripe, creates } = fakeStripe();

    for (const state of ["pending", "restricted", "not_connected"]) {
      await getDb().update(schema.studioProfiles).set({ stripeConnectState: state }).where(eq(schema.studioProfiles.organizationId, studio.organizationId));
      expect(await createCheckoutSession({ organizationId: studio.organizationId, cartId, galleryUrl: "https://g.example/g/tok", stripe })).toEqual({
        ok: false,
        error: "studio_not_payable",
      });
    }
    await getDb().update(schema.studioProfiles).set({ stripeConnectState: "active", stripeAccountId: null }).where(eq(schema.studioProfiles.organizationId, studio.organizationId));
    expect(await createCheckoutSession({ organizationId: studio.organizationId, cartId, galleryUrl: "https://g.example/g/tok", stripe })).toEqual({
      ok: false,
      error: "studio_not_payable",
    });
    expect(creates).toHaveLength(0);
  });

  it("refuses when the cart currency differs from the studio's charge currency", async () => {
    const { studio, variantId } = await seedStore();
    const cartId = await openCartId(studio.organizationId, variantId, 1500, 1);
    await getDb().update(schema.studioProfiles).set({ paymentCurrency: "eur" }).where(eq(schema.studioProfiles.organizationId, studio.organizationId));
    const { stripe, creates } = fakeStripe();
    expect(await createCheckoutSession({ organizationId: studio.organizationId, cartId, galleryUrl: "https://g.example/g/tok", stripe })).toEqual({
      ok: false,
      error: "currency_mismatch",
    });
    expect(creates).toHaveLength(0);
  });

  it("refuses a cart whose currency no longer matches the price list", async () => {
    const { studio, variantId } = await seedStore();
    const cartId = await openCartId(studio.organizationId, variantId, 1500, 1);
    // The list moves to EUR under the USD cart's feet.
    await getDb().update(schema.priceLists).set({ currency: "EUR" }).where(eq(schema.priceLists.organizationId, studio.organizationId));
    expect(await repriceCart(studio.organizationId, cartId)).toEqual({ ok: false, error: "currency_mismatch" });
  });
});
