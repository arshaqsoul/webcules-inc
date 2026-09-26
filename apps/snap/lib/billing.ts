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

/** Start an upgrade/plan-change checkout (subscription mode). */
export async function createPlanCheckout(
  organizationId: string,
  planId: PlanId,
  baseUrl: string,
): Promise<string | null> {
  const stripe = await getStripe();
  if (!stripe || !PAID_PLANS.includes(planId)) return null;
  const customerId = await ensureCustomer(organizationId);
  if (!customerId) return null;

  // Already subscribed → swap via subscription update (prorated by Stripe).
  const profile = await getStudioProfile(organizationId);
  if (profile?.stripeSubscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(profile.stripeSubscriptionId);
      const price = await ensurePrice(stripe, planId);
      if (price) {
        await stripe.subscriptions.update(sub.id, {
          items: [{ id: sub.items.data[0].id, price: price.id }],
          proration_behavior: "create_prorations",
          metadata: { organizationId, plan: planId },
        });
        await getDb()
          .update(schema.studioProfiles)
          .set({ plan: planId, planStatus: "active", updatedAt: new Date() })
          .where(eq(schema.studioProfiles.organizationId, organizationId));
        return null; // in-place swap — no redirect needed
      }
    } catch (err) {
      console.error("billing: subscription swap failed — falling back to checkout:", String(err));
    }
  }

  const price = await ensurePrice(stripe, planId);
  if (!price) return null;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: price.id, quantity: 1 }],
    subscription_data: { metadata: { organizationId, plan: planId } },
    metadata: { organizationId, plan: planId, kind: "plan_checkout" },
    success_url: `${baseUrl}/dashboard/settings?plan=return`,
    cancel_url: `${baseUrl}/dashboard/settings?plan=cancelled`,
  });
  return session.url;
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
  await db
    .update(schema.studioProfiles)
    .set({
      ...(plan && PLANS[plan] ? { plan } : {}),
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
      .set({ plan: "free", planStatus: "active", updatedAt: new Date() })
      .where(eq(schema.studioProfiles.organizationId, organizationId));
  }
}
