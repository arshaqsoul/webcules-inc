/* Stripe Connect (Epic 14) - the photographer's own Stripe account.
 * Snap stores only the account id + a DERIVED state; all KYC/bank data stays
 * in Stripe. Monetization is subscription-only: every client payment is a
 * DIRECT charge on the studio's account (WEB-352) - the money, the Stripe
 * processing fee and refunds all live in the studio's Stripe, and Snap's
 * platform balance is never touched. No application_fee_amount, ever.
 *
 * Why not Express: Stripe requires the platform to collect fees and carry
 * losses when the dashboard type is express, and (since 2026) rejects direct
 * charges on legacy type=express accounts for new platforms. Spike WEB-351
 * measured it: a destination charge cost the platform 4.00 on a 100.00 payment.
 *
 * State machine:
 *   not_connected → pending (account created, onboarding not finished)
 *   pending → active (charges_enabled && payouts_enabled && details_submitted)
 *   any → restricted (requirements past_due / pending_verification / disabled) */
import type Stripe from "stripe";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";

export type ConnectState = "not_connected" | "pending" | "active" | "restricted";

/** Controller settings for every studio account. Verified against Snap's own
 * Stripe account (WEB-351/352): full Stripe dashboard, the STUDIO account pays
 * Stripe fees, Stripe holds negative-balance liability. Direct charges on an
 * account created this way put the fee on the studio and nothing on Snap. */
export const STUDIO_ACCOUNT_CONTROLLER: Stripe.AccountCreateParams.Controller = {
  stripe_dashboard: { type: "full" },
  fees: { payer: "account" },
  losses: { payments: "stripe" },
  requirement_collection: "stripe",
};

/** Params for `stripe.accounts.create` - no legacy `type`, controller only. */
export function studioAccountParams(input: {
  organizationId: string;
  studioName: string;
  contactEmail?: string | null;
}): Stripe.AccountCreateParams {
  return {
    controller: STUDIO_ACCOUNT_CONTROLLER,
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    email: input.contactEmail ?? undefined,
    business_profile: { name: input.studioName, mcc: "8062", product_description: "Photography services" },
    metadata: { organizationId: input.organizationId, studio: input.studioName },
  };
}

/** The studio's connected account id when it can take charges, else null.
 * Client money may ONLY be charged on this account: callers must refuse
 * (never fall back to the platform account) when this returns null. */
export function chargeAccountId(
  profile: { stripeAccountId: string | null; stripeConnectState: string | null } | null | undefined,
): string | null {
  return profile?.stripeAccountId && profile.stripeConnectState === "active" ? profile.stripeAccountId : null;
}

/** Can this studio take client payments right now? (active connected account) */
export async function studioCanTakePayments(organizationId: string): Promise<boolean> {
  const row = (
    await getDb()
      .select({ stripeAccountId: schema.studioProfiles.stripeAccountId, stripeConnectState: schema.studioProfiles.stripeConnectState })
      .from(schema.studioProfiles)
      .where(eq(schema.studioProfiles.organizationId, organizationId))
      .limit(1)
  )[0];
  return chargeAccountId(row) !== null;
}

/** Stripe request options that make a call run ON the studio's account. */
export function onAccount(accountId: string): { stripeAccount: string } {
  return { stripeAccount: accountId };
}

export function deriveConnectState(account: Stripe.Account): ConnectState {
  // Never finished onboarding → pending (a fresh account carries
  // requirements.past_due from day one — that's not "restricted").
  if (!account.details_submitted) return "pending";
  const req = account.requirements;
  const pastDue = (req?.past_due?.length ?? 0) > 0;
  // Stripe is the authority on whether the account may take charges. While Stripe
  // verifies identity documents, charges_enabled stays true and only payouts wait
  // (WEB-352 staging test) - that must not block client payments or show an alarm.
  if (account.charges_enabled && !pastDue) return "active";
  // Verification in flight and nothing for the studio to do → still pending, not restricted.
  const onlyVerifying =
    !pastDue &&
    (req?.currently_due?.length ?? 0) === 0 &&
    (!req?.disabled_reason || req.disabled_reason === "requirements.pending_verification");
  if (onlyVerifying) return "pending";
  return "restricted";
}

/** The currency a studio's clients are charged in: the connected account's default
 * currency (lowercase ISO), or 'usd' when Stripe doesn't report one. */
export function paymentCurrencyOf(account: Pick<Stripe.Account, "default_currency">): string {
  const c = (account.default_currency ?? "").toLowerCase();
  return /^[a-z]{3}$/.test(c) ? c : "usd";
}

/** Cache the derived state (and payment currency) on the studio profile (idempotent). */
export async function saveConnectState(
  organizationId: string,
  accountId: string,
  state: ConnectState,
  currency?: string,
): Promise<void> {
  await getDb()
    .update(schema.studioProfiles)
    .set({
      stripeAccountId: accountId,
      stripeConnectState: state,
      ...(currency ? { paymentCurrency: currency } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.studioProfiles.organizationId, organizationId));
}

/** Live status read: retrieves the account from Stripe and refreshes the
 * cached state. Returns null when the studio never connected. */
export async function readConnectStatus(
  stripe: Stripe,
  organizationId: string,
  accountId: string,
): Promise<{ state: ConnectState; account: Stripe.Account } | null> {
  let account: Stripe.Account;
  try {
    account = await stripe.accounts.retrieve(accountId);
  } catch (err) {
    console.error(`connect: account retrieve failed (${accountId}):`, String(err));
    return null;
  }
  const state = deriveConnectState(account);
  await saveConnectState(organizationId, accountId, state, paymentCurrencyOf(account));
  return { state, account };
}

/** Onboarding or re-auth link (Stripe-hosted). Accounts that haven't fully
 * finished onboarding (e.g. identity verification pending) only accept
 * `account_onboarding`; fully-onboarded ones accept `account_update` — so a
 * rejected type falls back to the other. */
export async function createAccountLink(
  stripe: Stripe,
  accountId: string,
  kind: "account_onboarding" | "account_update",
  baseUrl: string,
): Promise<string | null> {
  const make = (type: "account_onboarding" | "account_update") =>
    stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${baseUrl}/dashboard/settings/payouts?refresh=1`,
      return_url: `${baseUrl}/dashboard/settings/payouts?return=1`,
      type,
    });
  try {
    return (await make(kind)).url;
  } catch (err) {
    if (/Valid types for this account/.test(String(err))) {
      try {
        return (await make(kind === "account_onboarding" ? "account_update" : "account_onboarding")).url;
      } catch {
        return null;
      }
    }
    console.error("connect: account link create failed:", String(err));
    return null;
  }
}
