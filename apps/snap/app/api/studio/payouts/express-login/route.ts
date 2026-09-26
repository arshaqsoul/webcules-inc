/* Stripe Express dashboard deep-link (WEB-157) — photographers manage bank
 * details and payouts there without a separate password. */
import { getOrgContext } from "@/lib/session";
import { getStudioProfile } from "@/lib/repos/studios";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST() {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const profile = await getStudioProfile(ctx.organizationId);
  if (!profile?.stripeAccountId) return Response.json({ error: "not_connected" }, { status: 409 });

  const stripe = await getStripe();
  if (!stripe) return Response.json({ error: "stripe_not_configured" }, { status: 503 });

  try {
    const link = await stripe.accounts.createLoginLink(profile.stripeAccountId);
    return Response.json({ ok: true, url: link.url });
  } catch (err) {
    console.error("connect: login link failed:", String(err));
    return Response.json({ error: "link_failed" }, { status: 502 });
  }
}
