/* Start (or resume) Stripe Express onboarding — creates the connected account
 * on first call, then returns a Stripe-hosted Account Link. Body
 * { update?: true } requests the re-auth variant for restricted accounts. */
import { getOrgContext } from "@/lib/session";
import { getStudioProfile, setStudioStripeAccount } from "@/lib/repos/studios";
import { createAccountLink } from "@/lib/connect";
import { getStripe } from "@/lib/stripe";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  const profile = await getStudioProfile(ctx.organizationId);
  if (!profile) return Response.json({ error: "no_studio" }, { status: 404 });

  const stripe = await getStripe();
  if (!stripe) return Response.json({ error: "stripe_not_configured" }, { status: 503 });

  let body: { update?: boolean } = {};
  try {
    body = (await req.json()) as { update?: boolean };
  } catch { /* empty body allowed */ }

  const baseUrl = new URL(req.url).origin;
  let accountId = profile.stripeAccountId;

  if (!accountId) {
    try {
      const account = await stripe.accounts.create({
        type: "express",
        email: profile.contactEmail ?? undefined,
        business_profile: { name: profile.studioName, mcc: "8062", product_description: "Photography services" },
        metadata: { organizationId: ctx.organizationId, studio: profile.studioName },
      });
      accountId = account.id;
      await setStudioStripeAccount(ctx.organizationId, accountId);
      await getDb().insert(schema.auditLog).values({
        id: crypto.randomUUID(),
        organizationId: ctx.organizationId,
        actorType: "user",
        actorId: ctx.user.id,
        action: "connect.account_created",
        targetType: "stripe_account",
        targetId: accountId,
      });
    } catch (err) {
      const message = String(err);
      console.error("connect: account create failed:", message);
      // The classic cause: Connect not yet enabled on the platform Stripe account.
      const hint = message.includes("Connect") ? "connect_not_enabled" : "account_create_failed";
      return Response.json({ error: hint }, { status: 402 });
    }
  }

  const url = await createAccountLink(
    stripe,
    accountId,
    body.update ? "account_update" : "account_onboarding",
    baseUrl,
  );
  if (!url) return Response.json({ error: "link_failed" }, { status: 502 });
  return Response.json({ ok: true, url });
}
