/* Start "connect an existing Stripe account" (WEB-352): signs a studio-bound state and
 * sends the signed-in user to Stripe's OAuth authorize page. 404 until
 * STRIPE_CONNECT_CLIENT_ID is configured, so the option never exists half-set-up. */
import { env } from "cloudflare:workers";

import { permissionDenied } from "@/lib/permissions";
import { getOrgContext } from "@/lib/session";
import { getStudioProfile } from "@/lib/repos/studios";
import { oauthAuthorizeUrl, oauthRedirectUri, signOAuthState } from "@/lib/stripe-oauth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "billing.write");
  if (denied) return denied;

  const clientId = env.STRIPE_CONNECT_CLIENT_ID;
  const secret = env.BETTER_AUTH_SECRET;
  if (!clientId || !secret) return Response.json({ error: "oauth_not_configured" }, { status: 404 });

  const profile = await getStudioProfile(ctx.organizationId);
  if (!profile) return Response.json({ error: "no_studio" }, { status: 404 });
  // One Stripe account per studio: disconnecting is a deliberate act, not a side effect.
  if (profile.stripeAccountId) return Response.json({ error: "already_connected" }, { status: 409 });

  const origin = (env as { NEXT_PUBLIC_APP_URL?: string }).NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const state = await signOAuthState(secret, ctx.organizationId);
  return Response.redirect(
    oauthAuthorizeUrl({
      clientId,
      redirectUri: oauthRedirectUri(origin),
      state,
      email: profile.contactEmail,
      businessName: profile.studioName,
    }),
    302,
  );
}
