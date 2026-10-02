/* Snap's own subscription billing (WEB-152) — Stripe on the PLATFORM account.
 * Lite/Studio/Pro are monthly subscriptions; Free needs no card. Prices are
 * created lazily on first use (looked up by product metadata) so no manual
 * Stripe dashboard setup is required. Entitlements flip via webhook; dunning
 * keeps the plan through a 14-day grace before downgrade — never data loss. */
import type Stripe from "stripe";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { PLANS, type PlanId } from "@/lib/plans";
import { getStudioProfile } from "@/lib/repos/studios";
import { getStripe } from "@/lib/stripe";

export const GRACE_DAYS = 14;
const PAID_PLANS: PlanId[] = ["lite", "studio", "pro"];

async function ensurePrice(stripe: Stripe, planId: PlanId): Promise<Stripe.Price | null> {
  const def = PLANS[planId];
  const existing = await stripe.prices.list({
    active: true,
    limit: 100,
    product: undefined,
  });
  for (const p of existing.data) {
    const prod = typeof p.product === "object" && p.product ? p.product : null;
    const meta = prod && !(prod as Stripe.Product).deleted ? (prod as Stripe.Product).metadata : (p.metadata ?? {});
    if (p.recurring?.interval === "month" && p.unit_amount === def.priceMonthlyUsd * 100 && meta?.snap_plan === planId) {
      return p;
    }
  }
  try {
    const product = await stripe.products.create({
      name: `Snap ${def.name}`,
      description: `Snap ${def.name} plan — ${def.storageBytes >= 1024 ** 4 ? `${def.storageBytes / 1024 ** 4}TB` : `${Math.round(def.storageBytes / 1024 ** 3)}GB`} storage for your photography studio.`,
      metadata: { snap_plan: planId },
    });
    return await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: def.priceMonthlyUsd * 100,
      recurring: { interval: "month" },
      metadata: { snap_plan: planId },
    });
  } catch (err) {
    console.error(`billing: price ensure failed (${planId}):`, String(err));
    return null;
  }
}

/** Ensure a platform customer for the studio; idempotent, stored on profile. */
export async function ensureCustomer(organizationId: string): Promise<string | null> {
  const stripe = await getStripe();
  const profile = await getStudioProfile(organizationId);
  if (!stripe || !profile) return null;

  if (profile.stripeCustomerId) return profile.stripeCustomerId;
  try {
    const customer = await stripe.customers.create({
      email: profile.contactEmail ?? undefined,
      name: profile.studioName,
      metadata: { organizationId },
    });
    await getDb()
      .update(schema.studioProfiles)
      .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
      .where(eq(schema.studioProfiles.organizationId, organizationId));
    return customer.id;
  } catch (err) {
    console.error("billing: customer create failed:", String(err));
    return null;
  }
}

/** Result of a plan-change request: "checkout" → redirect the user to
 * Stripe to START a subscription (none exists); "swapped" → in-place change
 * applied immediately (upgrade charged now via proration, or an instant
 * switch-back); "scheduled" → cheaper tier locked in for the NEXT billing
 * cycle, nothing charged now; "pending" → upgrade awaiting payment (applies
 * only if the charge succeeds). */
export type PlanChangeResult = {
  url: string | null;
  mode: "checkout" | "swapped" | "scheduled" | "pending";
  message?: string;
};

/** True when the current tier was adopted DURING the current billing period
 * (i.e. an upgrade whose proration was charged this cycle) — the industry
 * "reversal" case, eligible for an instant prorated switch-back. */
export async function downgradeReversible(organizationId: string): Promise<boolean> {
  const profile = await getStudioProfile(organizationId);
  if (!profile?.stripeSubscriptionId || !profile.planChangedAt || !profile.planPeriodEnd) return false;
  // A monthly cycle is at most ~31 days; planChangedAt inside that window
  // before period end means the change happened this cycle.
  return profile.planChangedAt > profile.planPeriodEnd - 31 * 86400;
}

/** Industry-standard plan change (2026 research, Stripe-documented):
 * - Upgrade: immediate, `always_invoice` + `pending_if_incomplete` — the
 *   prorated difference is charged NOW and the plan only changes if the
 *   payment succeeds (failed card ⇒ plan unchanged, never past_due perks).
 * - Downgrade: applies at the NEXT billing cycle with no proration
 *   (Netflix/Apple/Google One/GitHub/Stripe-portal default), except an
 *   explicit same-cycle switch-back (`timing:"now"`), which is an instant
 *   prorated swap — Stripe's ledger nets out the unused upgraded time as a
 *   credit on the next invoice, so only days actually spent on the higher
 *   tier are paid for. No cash refunds, ever (credits roll forward). */
export async function createPlanCheckout(
  organizationId: string,
  planId: PlanId,
  baseUrl: string,
  timing: "now" | "cycle" = "cycle",
): Promise<PlanChangeResult> {
  const stripe = await getStripe();
  if (!stripe || !PAID_PLANS.includes(planId)) return { url: null, mode: "swapped" };
  const customerId = await ensureCustomer(organizationId);
  if (!customerId) return { url: null, mode: "swapped" };

  // Already subscribed → change in place, no checkout.
  const profile = await getStudioProfile(organizationId);
  if (profile?.stripeSubscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(profile.stripeSubscriptionId);
      const price = await ensurePrice(stripe, planId);
      if (price) {
        const currentPrice = PLANS[(profile.plan as PlanId) ?? "free"]?.priceMonthlyUsd ?? 0;
        const nowSec = Math.floor(Date.now() / 1000);
        if (PLANS[planId].priceMonthlyUsd < currentPrice) {
          const reversible = (profile.planChangedAt ?? 0) > ((profile.planPeriodEnd ?? 0) - 31 * 86400);
          if (timing === "now" && reversible) {
            // Instant switch-back: prorations net the upgrade out; the
            // remaining credit lands on the next invoice.
            await stripe.subscriptions.update(sub.id, {
              items: [{ id: sub.items.data[0].id, price: price.id }],
              proration_behavior: "create_prorations",
              cancel_at_period_end: false,
              metadata: { organizationId, plan: planId },
            });
            await getDb()
              .update(schema.studioProfiles)
              .set({ plan: planId, pendingPlan: null, planStatus: "active", planChangedAt: nowSec, updatedAt: new Date() })
              .where(eq(schema.studioProfiles.organizationId, organizationId));
            return {
              url: null,
              mode: "swapped",
              message: `Switched back to ${PLANS[planId].name} — the unused difference from your upgrade is credited on your next invoice.`,
            };
          }
          // Plain downgrade: the lower price starts next cycle — no charge,
          // no credit, no checkout. Entitlements stay on the current plan
          // until the period ends; pending_plan flips via the renewal
          // webhook or the daily cron.
          await stripe.subscriptions.update(sub.id, {
            items: [{ id: sub.items.data[0].id, price: price.id }],
            proration_behavior: "none",
            cancel_at_period_end: false, // a previously scheduled cancel is superseded
            metadata: { organizationId, plan: planId },
          });
          await getDb()
            .update(schema.studioProfiles)
            .set({ pendingPlan: planId, planStatus: "active", updatedAt: new Date() })
            .where(eq(schema.studioProfiles.organizationId, organizationId));
          return { url: null, mode: "scheduled" };
        }
        // Upgrade: charge the prorated difference now; apply only if the
        // payment succeeds (pending_if_incomplete — Stripe documented).
        const updated = await stripe.subscriptions.update(sub.id, {
          items: [{ id: sub.items.data[0].id, price: price.id }],
          proration_behavior: "always_invoice",
          payment_behavior: "pending_if_incomplete",
          metadata: { organizationId, plan: planId },
        });
        const applied =
          (typeof updated.items.data[0].price === "string"
            ? updated.items.data[0].price
            : updated.items.data[0].price?.id) === price.id;
        if (!applied) {
          return {
            url: null,
            mode: "pending",
            message: `Payment for ${PLANS[planId].name} is processing — the upgrade applies as soon as it succeeds.`,
          };
        }
        await getDb()
          .update(schema.studioProfiles)
          .set({ plan: planId, pendingPlan: null, planStatus: "active", planChangedAt: nowSec, updatedAt: new Date() })
          .where(eq(schema.studioProfiles.organizationId, organizationId));
        return {
          url: null,
          mode: "swapped",
          message: `Upgraded to ${PLANS[planId].name} — the prorated difference was charged now; your next invoice is $${PLANS[planId].priceMonthlyUsd}.`,
        };
      }
    } catch (err) {
      console.error("billing: subscription change failed — falling back to checkout:", String(err));
    }
  }

  const price = await ensurePrice(stripe, planId);
  if (!price) return { url: null, mode: "swapped" };
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: price.id, quantity: 1 }],
    subscription_data: { metadata: { organizationId, plan: planId } },
    metadata: { organizationId, plan: planId, kind: "plan_checkout" },
    success_url: `${baseUrl}/dashboard/settings/billing?return=1`,
    cancel_url: `${baseUrl}/dashboard/settings/billing`,
  });
  return { url: session.url, mode: "checkout" };
}

/** Studios with no subscription (grandfathered plan rows, pre-launch
 * defaults): "downgrading" to Free is a plain row update — there is nothing
 * to cancel at period end and nothing to refund. */
export async function setPlanFreeImmediately(organizationId: string): Promise<boolean> {
  const profile = await getStudioProfile(organizationId);
  if (!profile || profile.stripeSubscriptionId) return false;
  await getDb()
    .update(schema.studioProfiles)
    .set({
      plan: "free",
      pendingPlan: null,
      planStatus: "active",
      planChangedAt: Math.floor(Date.now() / 1000),
      updatedAt: new Date(),
    })
    .where(eq(schema.studioProfiles.organizationId, organizationId));
  return true;
}

/** Proration preview (Stripe-documented pattern): what an immediate change
 * to `planId` would cost/credit RIGHT NOW, without mutating anything. Used
 * by the confirm dialog so the user sees the exact amount first. */
export async function previewPlanChange(
  organizationId: string,
  planId: PlanId,
): Promise<
  | { ok: false; error: "no_subscription" | "no_studio" | "stripe" }
  | {
      ok: true;
      /** Net amount due immediately (USD, positive) or credit (negative). */
      netMinor: number;
      creditMinor: number | null;
      chargeMinor: number | null;
      /** Effective date label for the immediate change. */
      effective: "now";
    }
> {
  const stripe = await getStripe();
  const profile = await getStudioProfile(organizationId);
  if (!profile) return { ok: false, error: "no_studio" };
  if (!stripe || !profile.stripeSubscriptionId) return { ok: false, error: "no_subscription" };
  try {
    const sub = await stripe.subscriptions.retrieve(profile.stripeSubscriptionId);
    const price = await ensurePrice(stripe, planId);
    if (!price) return { ok: false, error: "stripe" };
    const preview = await stripe.invoices.createPreview({
      customer: profile.stripeCustomerId ?? undefined,
      subscription: sub.id,
      subscription_details: {
        items: [{ id: sub.items.data[0].id, price: price.id }],
        proration_behavior: "always_invoice",
      },
    });
    let creditMinor: number | null = null;
    let chargeMinor: number | null = null;
    for (const line of preview.lines?.data ?? []) {
      const amount = line.amount ?? 0;
      if (amount < 0) creditMinor = (creditMinor ?? 0) + amount;
      else chargeMinor = (chargeMinor ?? 0) + amount;
    }
    return { ok: true, netMinor: preview.total ?? 0, creditMinor, chargeMinor, effective: "now" };
  } catch (err) {
    console.error("billing: proration preview failed:", String(err));
    return { ok: false, error: "stripe" };
  }
}

/** Cancel (downgrade to free) at period end — data is never touched. */
export async function cancelPlanAtPeriodEnd(organizationId: string): Promise<boolean> {
  const stripe = await getStripe();
  const profile = await getStudioProfile(organizationId);
  if (!stripe || !profile?.stripeSubscriptionId) return false;
  try {
    await stripe.subscriptions.update(profile.stripeSubscriptionId, { cancel_at_period_end: true });
    return true;
  } catch (err) {
    console.error("billing: cancel failed:", String(err));
    return false;
  }
}

/** Resume a scheduled cancellation. */
export async function resumePlan(organizationId: string): Promise<boolean> {
  const stripe = await getStripe();
  const profile = await getStudioProfile(organizationId);
  if (!stripe || !profile?.stripeSubscriptionId) return false;
  try {
    await stripe.subscriptions.update(profile.stripeSubscriptionId, { cancel_at_period_end: false });
    return true;
  } catch (err) {
    console.error("billing: resume failed:", String(err));
    return false;
  }
}

/** Stripe customer portal for card/invoice self-service. */
export async function createPortalSession(
  organizationId: string,
  baseUrl: string,
): Promise<{ ok: true; url: string } | { ok: false; error: "no_customer" | "portal_failed" }> {
  const stripe = await getStripe();
  const profile = await getStudioProfile(organizationId);
  if (!profile?.stripeCustomerId) return { ok: false, error: "no_customer" };
  if (!stripe) return { ok: false, error: "portal_failed" };
  try {
    const configurations = await stripe.billingPortal.configurations.list({ limit: 1, active: true });
    let configId = configurations.data[0]?.id;
    if (!configId) {
      // The portal's plan-switch feature needs product+price pairs listed.
      const switchProducts: { product: string; prices: string[] }[] = [];
      for (const p of ["lite", "studio", "pro"] as PlanId[]) {
        const price = await ensurePrice(stripe, p);
        const productId =
          price && (typeof price.product === "string" ? price.product : price.product?.id);
        if (price && productId) switchProducts.push({ product: productId, prices: [price.id] });
      }
      const created = await stripe.billingPortal.configurations.create({
        features: {
          payment_method_update: { enabled: true },
          invoice_history: { enabled: true },
          subscription_cancel: { enabled: true, mode: "at_period_end", proration_behavior: "none" },
          subscription_update: {
            enabled: true,
            default_allowed_updates: ["price" as const],
            proration_behavior: "create_prorations",
            products: switchProducts,
          } as Parameters<typeof stripe.billingPortal.configurations.create>[0]["features"]["subscription_update"],
        },
      });
      configId = created.id;
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripeCustomerId,
      return_url: `${baseUrl}/dashboard/settings`,
      configuration: configId,
    });
    return { ok: true, url: session.url };
  } catch (err) {
    console.error("billing: portal session failed:", String(err));
    return { ok: false, error: "portal_failed" };
  }
}

/** Apply subscription state → plan fields (called from webhook + on-view). */
export async function applySubscriptionState(sub: Stripe.Subscription): Promise<void> {
  const organizationId = sub.metadata?.organizationId;
  if (!organizationId) return;
  const plan = (sub.metadata?.plan as PlanId | undefined) ?? undefined;
  const status =
    sub.status === "active" || sub.status === "trialing" ? "active"
    : sub.status === "past_due" ? "past_due"
    : "canceled";
  const db = getDb();
  // Scheduled downgrade still inside its billing period: keep the current
  // plan's entitlements (the sub's price already holds the lower tier for
  // next cycle). Once the stored period end passes — renewal webhook or
  // cron — the pending plan applies.
  const profile = await getStudioProfile(organizationId);
  const pendingStillValid =
    Boolean(profile?.pendingPlan) && sub.status !== "canceled" && (profile?.planPeriodEnd ?? 0) * 1000 > Date.now();
  const planChanged = Boolean(plan && PLANS[plan] && !pendingStillValid && profile?.plan !== plan);
  // WEB-231: add-on entitlement recompute from subscription items (the
  // add-on price's metadata rides inside events). A pending removal inside
  // its paid period keeps the entitlement on until the settle clears it.
  const addonOn = subscriptionHasAddon(sub, "custom_domain") !== null;
  const keepAddon =
    // (audit fix): past_due sits INSIDE the 14-day dunning grace the plan
    // itself keeps — the domain add-on must survive it too, or the studio's
    // custom domain suspends on the first failed charge.
    (sub.status === "active" || sub.status === "trialing" || sub.status === "past_due") &&
    (addonOn || (Boolean(profile?.pendingAddonRemoval) && (profile?.planPeriodEnd ?? 0) * 1000 > Date.now()));
  await db
    .update(schema.studioProfiles)
    .set({
      ...(plan && PLANS[plan] && !pendingStillValid ? { plan, pendingPlan: null } : {}),
      ...(planChanged ? { planChangedAt: Math.floor(Date.now() / 1000) } : {}),
      addonCustomDomain: keepAddon,
      planStatus: status,
      stripeSubscriptionId: sub.status === "canceled" ? null : sub.id,
      planPeriodEnd: (sub.items.data[0] as { current_period_end?: number } | undefined)?.current_period_end ?? null,
      updatedAt: new Date(),
    })
    .where(eq(schema.studioProfiles.organizationId, organizationId));

  // Subscription deleted → free (data untouched; caps tighten only).
  if (sub.status === "canceled") {
    await db
      .update(schema.studioProfiles)
      .set({
        plan: "free",
        pendingPlan: null,
        addonCustomDomain: false,
        pendingAddonRemoval: false,
        planStatus: "active",
        planChangedAt: Math.floor(Date.now() / 1000),
        updatedAt: new Date(),
      })
      .where(eq(schema.studioProfiles.organizationId, organizationId));
  }
}

/* ---------------- Custom-domain add-on (WEB-224/231) ----------------
 * A second line item on the SAME parent subscription (WEB-152/217: one
 * bill per family). Lazy price creation keyed by metadata — the price's
 * metadata travels inside webhook events, so the entitlement recompute
 * needs no product expansion. Cancellation holds the entitlement through
 * the paid cycle (pending_addon_removal), mirroring plan-downgrade timing. */

export const ADDON_CUSTOM_DOMAIN_USD = 5;
export type AddonId = "custom_domain";

async function ensureAddonPrice(stripe: Stripe, addon: AddonId): Promise<Stripe.Price | null> {
  const unit = ADDON_CUSTOM_DOMAIN_USD * 100;
  const existing = await stripe.prices.list({ active: true, limit: 100 });
  for (const p of existing.data) {
    if (p.recurring?.interval === "month" && p.unit_amount === unit && p.metadata?.snap_addon === addon) {
      return p;
    }
  }
  try {
    const product = await stripe.products.create({
      name: "Snap Custom Domain add-on",
      description: "One custom domain for your client galleries, booking page, and portal.",
      metadata: { snap_addon: addon },
    });
    return await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: unit,
      recurring: { interval: "month" },
      metadata: { snap_addon: addon },
    });
  } catch (err) {
    console.error(`billing: addon price ensure failed (${addon}):`, String(err));
    return null;
  }
}

/** Does this subscription carry the add-on item? Price metadata only — no
 * product expansion needed (metadata rides on the price object). */
function subscriptionHasAddon(sub: Stripe.Subscription, addon: AddonId): string | null {
  for (const item of sub.items.data ?? []) {
    const price = typeof item.price === "object" ? item.price : null;
    if (price?.metadata?.snap_addon === addon) return item.id;
  }
  return null;
}

export async function setCustomDomainAddon(
  organizationId: string,
  enable: boolean,
): Promise<{ ok: boolean; message?: string }> {
  const stripe = await getStripe();
  const profile = await getStudioProfile(organizationId);
  if (!stripe || !profile?.stripeSubscriptionId) {
    return { ok: false, message: "The add-on rides on your Snap subscription — pick a plan first (Billing → upgrade), then add the domain." };
  }
  try {
    const sub = await stripe.subscriptions.retrieve(profile.stripeSubscriptionId);
    const itemId = subscriptionHasAddon(sub, "custom_domain");
    if (enable) {
      if (itemId) {
        await getDb()
          .update(schema.studioProfiles)
          .set({ addonCustomDomain: true, pendingAddonRemoval: false, updatedAt: new Date() })
          .where(eq(schema.studioProfiles.organizationId, organizationId));
        return { ok: true, message: "The domain add-on is already on your bill." };
      }
      const price = await ensureAddonPrice(stripe, "custom_domain");
      if (!price) return { ok: false, message: "Stripe price setup failed — try again in a minute." };
      // Append the second item — existing items are untouched when omitted.
      await stripe.subscriptions.update(sub.id, {
        items: [{ price: price.id, quantity: 1 }],
        proration_behavior: "create_prorations",
      });
      await getDb()
        .update(schema.studioProfiles)
        .set({ addonCustomDomain: true, pendingAddonRemoval: false, updatedAt: new Date() })
        .where(eq(schema.studioProfiles.organizationId, organizationId));
      return { ok: true, message: `Custom domain add-on added — $${ADDON_CUSTOM_DOMAIN_USD}/mo on your existing bill (prorated from today).` };
    }
    // Cancel: keep the entitlement through the paid cycle; the item drops at
    // renewal (settlePendingAddonRemovals) — WEB-152 next-cycle semantics.
    if (!itemId) {
      await getDb()
        .update(schema.studioProfiles)
        .set({ addonCustomDomain: false, pendingAddonRemoval: false, updatedAt: new Date() })
        .where(eq(schema.studioProfiles.organizationId, organizationId));
      return { ok: true, message: "The add-on isn't on your bill." };
    }
    if (profile.pendingAddonRemoval) {
      return { ok: true, message: "Already cancelling — the add-on stays active until the end of your billing period." };
    }
    await getDb()
      .update(schema.studioProfiles)
      .set({ pendingAddonRemoval: true, updatedAt: new Date() })
      .where(eq(schema.studioProfiles.organizationId, organizationId));
    const until = profile.planPeriodEnd ? new Date(profile.planPeriodEnd * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : "the end of your billing period";
    return { ok: true, message: `The add-on stays active until ${until}; your bill drops by $${ADDON_CUSTOM_DOMAIN_USD}/mo after that.` };
  } catch (err) {
    console.error("billing: addon change failed:", String(err));
    return { ok: false, message: "Stripe rejected the change — try again in a minute." };
  }
}

/** Daily cron: profiles whose add-on cancellation reached period end —
 * delete the item (no proration; the cycle was paid) and clear the flag. */
export async function settlePendingAddonRemovals(): Promise<number> {
  const stripe = await getStripe();
  if (!stripe) return 0;
  const db = getDb();
  const rows = await db
    .select({
      organizationId: schema.studioProfiles.organizationId,
      subscriptionId: schema.studioProfiles.stripeSubscriptionId,
      periodEnd: schema.studioProfiles.planPeriodEnd,
    })
    .from(schema.studioProfiles)
    .where(eq(schema.studioProfiles.pendingAddonRemoval, true))
    .limit(100);
  let settled = 0;
  for (const row of rows) {
    if (!row.subscriptionId || !row.periodEnd || row.periodEnd * 1000 > Date.now()) continue;
    try {
      const sub = await stripe.subscriptions.retrieve(row.subscriptionId);
      const itemId = subscriptionHasAddon(sub, "custom_domain");
      if (itemId) await stripe.subscriptionItems.del(itemId, { proration_behavior: "none" });
    } catch (err) {
      console.error(`billing: addon settle failed (${row.organizationId}):`, String(err));
      continue;
    }
    await db
      .update(schema.studioProfiles)
      .set({ addonCustomDomain: false, pendingAddonRemoval: false, updatedAt: new Date() })
      .where(eq(schema.studioProfiles.organizationId, row.organizationId));
    settled++;
  }
  return settled;
}
