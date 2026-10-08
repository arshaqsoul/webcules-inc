/* Stripe dashboard deep-link (WEB-157, WEB-352). Studio accounts have the full
 * Stripe dashboard (the photographer owns a regular Stripe account), so there
 * is no Express login link: legacy Express accounts still get one, everyone
 * else is sent to dashboard.stripe.com. */
import { permissionDenied } from "@/lib/permissions";
import { getOrgContext } from "@/lib/session";
import { getStudioProfile } from "@/lib/repos/studios";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST() {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  // WEB-275: role gate (billing.write).
  const denied = permissionDenied(ctx, "billing.write");
  if (denied) return denied;
  const profile = await getStudioProfile(ctx.organizationId);
  if (!profile?.stripeAccountId) return Response.json({ error: "not_connected" }, { status: 409 });

  const stripe = await getStripe();
  if (!stripe) return Response.json({ error: "stripe_not_configured" }, { status: 503 });

  try {
    const link = await stripe.accounts.createLoginLink(profile.stripeAccountId);
    return Response.json({ ok: true, url: link.url });
  } catch {
    // Full-dashboard accounts reject login links - the studio signs in to Stripe directly.
    return Response.json({ ok: true, url: "https://dashboard.stripe.com/" });
  }
}
