/* Stripe Connect (Epic 14) — Express accounts for photographer payouts.
 * Snap stores only the account id + a DERIVED state; all KYC/bank data stays
 * in Stripe. Monetization is subscription-only: destination charges carry
 * application_fee_amount 0 (the platform takes nothing from bookings).
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

export function deriveConnectState(account: Stripe.Account): ConnectState {
  // Never finished onboarding → pending (a fresh Express account carries
  // requirements.past_due from day one — that's not "restricted").
  if (!account.details_submitted) return "pending";
  const req = account.requirements;
  const blocked =
    Boolean(req?.disabled_reason) ||
    (req?.past_due?.length ?? 0) > 0 ||
    (req?.pending_verification?.length ?? 0) > 0;
  if (blocked) return "restricted";
  if (account.charges_enabled && account.payouts_enabled) return "active";
  return "pending";
}

/** Cache the derived state on the studio profile (idempotent). */
export async function saveConnectState(organizationId: string, accountId: string, state: ConnectState): Promise<void> {
  await getDb()
    .update(schema.studioProfiles)
    .set({ stripeAccountId: accountId, stripeConnectState: state, updatedAt: new Date() })
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
  await saveConnectState(organizationId, accountId, state);
  return { state, account };
}

/** Onboarding or re-auth link (Stripe-hosted). */
export async function createAccountLink(
  stripe: Stripe,
  accountId: string,
  kind: "account_onboarding" | "account_update",
  baseUrl: string,
): Promise<string | null> {
  try {
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${baseUrl}/dashboard/settings?payouts=refresh`,
      return_url: `${baseUrl}/dashboard/settings?payouts=return`,
      type: kind,
    });
    return link.url;
  } catch (err) {
    console.error("connect: account link create failed:", String(err));
    return null;
  }
}
