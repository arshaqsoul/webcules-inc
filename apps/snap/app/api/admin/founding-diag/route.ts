/* WEBC-127 TEMP DIAGNOSTIC — delete after the founding-offer investigation.
 * Founder-directed live check: the FOUNDING promotion code redeems fine in
 * test mode but Checkout rejects it in live mode ("This code is invalid.")
 * even though the coupon + code are healthy. This route re-creates the same
 * Lite checkout session with `discounts: [{ promotion_code }]` instead of
 * `allow_promotion_codes`, so Stripe's API names the real rejection cause
 * (customer restriction, product mismatch, wrong account/mode, Billing gate).
 * No payment, no mutation: one promotionCodes.list + one abandoned session.
 * Access: the skeleton prod test account only (no real studios, no founder org). */
import { ensureCustomer, ensurePrice } from "@/lib/billing";
import { getOrgContext } from "@/lib/session";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

const DIAG_EMAIL = "skeleton-test-1790499008@webcules.com";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx || ctx.user.email.toLowerCase() !== DIAG_EMAIL) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const { organizationId } = ctx;
  const stripe = await getStripe();
  if (!stripe) return Response.json({ error: "no stripe" }, { status: 500 });

  const out: Record<string, unknown> = {};
  try {
    const codes = await stripe.promotionCodes.list({ code: "FOUNDING", limit: 10 });
    const pc = codes.data[0];
    const rawPc = pc as unknown as { coupon?: string | { id?: string }; promotion?: { coupon?: string | { id?: string } } } | undefined;
    const pcCoupon = rawPc?.coupon ?? rawPc?.promotion?.coupon;
    out.promotionCode = pc
      ? {
          id: pc.id,
          code: pc.code,
          active: pc.active,
          livemode: pc.livemode,
          coupon: typeof pcCoupon === "string" ? pcCoupon : pcCoupon?.id,
          restrictions: pc.restrictions ?? null,
        }
      : "not found";
    if (!pc) return Response.json(out);

    const price = await ensurePrice(stripe, "lite");
    if (!price) return Response.json({ ...out, error: "no lite price" });
    const productId = typeof price.product === "string" ? price.product : price.product?.id;
    out.price = { id: price.id, livemode: price.livemode, product: productId };
    const customerId = await ensureCustomer(organizationId);
    out.customerId = customerId;
    if (!customerId) return Response.json({ ...out, error: "no customer" });

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: price.id, quantity: 1 }],
        discounts: [{ promotion_code: pc.id }],
        subscription_data: { metadata: { organizationId: organizationId, plan: "lite" } },
        metadata: { organizationId: organizationId, plan: "lite", kind: "founding_diag" },
        success_url: "https://snap.webcules.com/dashboard/settings/billing?return=1",
        cancel_url: "https://snap.webcules.com/dashboard/settings/billing",
      });
      out.discountSession = { created: true, id: session.id, livemode: session.livemode };
    } catch (err) {
      const e = err as { type?: string; code?: string; message?: string; requestId?: string; statusCode?: number };
      out.discountSession = {
        created: false,
        type: e.type,
        code: e.code,
        message: e.message,
        requestId: e.requestId,
        statusCode: e.statusCode,
      };
    }
    return Response.json(out);
  } catch (err) {
    return Response.json({ ...out, fatal: String(err) }, { status: 500 });
  }
}
