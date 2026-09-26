/* Payouts status (GET) — live Stripe read when connected; D1 cache otherwise.
 * WEB-157 extends this with balance + payouts; this route is the state source
 * for the Settings → Payouts panel and the destination-charge gate. */
import { getOrgContext } from "@/lib/session";
import { getStudioProfile } from "@/lib/repos/studios";
import { readConnectStatus, type ConnectState } from "@/lib/connect";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  const profile = await getStudioProfile(ctx.organizationId);
  if (!profile) return Response.json({ error: "no_studio" }, { status: 404 });

  if (!profile.stripeAccountId) {
    return Response.json({ state: "not_connected" as ConnectState, accountId: null });
  }

  const stripe = await getStripe();
  if (!stripe) return Response.json({ error: "stripe_not_configured" }, { status: 503 });

  const live = await readConnectStatus(stripe, ctx.organizationId, profile.stripeAccountId);
  if (!live) {
    // Account deleted in Stripe or transient API failure — fall back to cache.
    return Response.json({ state: profile.stripeConnectState as ConnectState, accountId: profile.stripeAccountId, stale: true });
  }

  // WEB-157: balance + recent payouts read on demand (platform key, connected
  // account header). Failures here never break the status itself.
  let balance: { availableMinor: number; pendingMinor: number; currency: string } | null = null;
  let lastPayout: { amountMinor: number; currency: string; arrivalAt: string; status: string } | null = null;
  try {
    const bal = await stripe.balance.retrieve({}, { stripeAccount: profile.stripeAccountId });
    const avail = bal.available[0];
    const pend = bal.pending[0];
    balance = {
      availableMinor: avail ? avail.amount : 0,
      pendingMinor: pend ? pend.amount : 0,
      currency: avail?.currency ?? pend?.currency ?? "usd",
    };
    const payouts = await stripe.payouts.list({ limit: 1 }, { stripeAccount: profile.stripeAccountId });
    const p = payouts.data[0];
    if (p) {
      lastPayout = { amountMinor: p.amount, currency: p.currency, arrivalAt: new Date(p.arrival_date * 1000).toISOString(), status: p.status };
    }
  } catch (err) {
    console.error("connect balance read failed (non-fatal):", String(err));
  }

  return Response.json({
    state: live.state,
    accountId: profile.stripeAccountId,
    chargesEnabled: live.account.charges_enabled,
    payoutsEnabled: live.account.payouts_enabled,
    detailsSubmitted: live.account.details_submitted,
    disabledReason: live.account.requirements?.disabled_reason ?? null,
    pastDue: live.account.requirements?.past_due ?? [],
    pendingVerification: live.account.requirements?.pending_verification ?? [],
    payoutSchedule: live.account.settings?.payouts?.schedule ?? null,
    balance,
    lastPayout,
  });
}
