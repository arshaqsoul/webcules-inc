/* Stripe OAuth callback (WEB-352): completes "connect an existing Stripe account".
 * Requires the signed-in studio user, a valid signed state bound to that studio, and an
 * account no other studio has connected. The account id comes from Stripe's token
 * endpoint (never from the query string), and its state/currency are read live. */
import { and, eq, ne } from "drizzle-orm";
import { env } from "cloudflare:workers";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { deriveConnectState, paymentCurrencyOf, saveConnectState } from "@/lib/connect";
import { permissionDenied } from "@/lib/permissions";
import { getStudioProfile } from "@/lib/repos/studios";
import { getOrgContext } from "@/lib/session";
import { getStripe } from "@/lib/stripe";
import { verifyOAuthState } from "@/lib/stripe-oauth";

export const dynamic = "force-dynamic";

const back = (req: Request, result: string) =>
  Response.redirect(new URL(`/dashboard/settings/payouts?oauth=${result}`, req.url).toString(), 302);

export async function GET(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.redirect(new URL("/login", req.url).toString(), 302);
  const denied = permissionDenied(ctx, "billing.write");
  if (denied) return denied;

  const secret = env.BETTER_AUTH_SECRET;
  if (!env.STRIPE_CONNECT_CLIENT_ID || !secret) return Response.json({ error: "oauth_not_configured" }, { status: 404 });

  const url = new URL(req.url);
  if (url.searchParams.get("error")) return back(req, "denied");
  if (!(await verifyOAuthState(secret, url.searchParams.get("state"), ctx.organizationId))) return back(req, "invalid_state");
  const code = url.searchParams.get("code");
  if (!code || code.length > 200) return back(req, "invalid_code");

  const profile = await getStudioProfile(ctx.organizationId);
  if (!profile) return back(req, "failed");
  if (profile.stripeAccountId) return back(req, "already_connected");

  const stripe = await getStripe();
  if (!stripe) return back(req, "failed");

  try {
    const token = await stripe.oauth.token({ grant_type: "authorization_code", code });
    const accountId = token.stripe_user_id;
    if (!accountId || !accountId.startsWith("acct_")) return back(req, "failed");

    // An account can serve one studio only.
    const taken = (
      await getDb()
        .select({ id: schema.studioProfiles.organizationId })
        .from(schema.studioProfiles)
        .where(and(eq(schema.studioProfiles.stripeAccountId, accountId), ne(schema.studioProfiles.organizationId, ctx.organizationId)))
        .limit(1)
    )[0];
    if (taken) return back(req, "account_in_use");

    const account = await stripe.accounts.retrieve(accountId);
    await saveConnectState(ctx.organizationId, accountId, deriveConnectState(account), paymentCurrencyOf(account));
    await getDb().insert(schema.auditLog).values({
      id: crypto.randomUUID(),
      organizationId: ctx.organizationId,
      actorType: "user",
      actorId: ctx.user.id,
      action: "connect.account_linked",
      targetType: "stripe_account",
      targetId: accountId,
    });
    return back(req, "connected");
  } catch (err) {
    console.error("connect: oauth token exchange failed:", String(err));
    return back(req, "failed");
  }
}
