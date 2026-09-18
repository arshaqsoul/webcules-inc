import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { db } from "@/db";
import { leads, payments, subscriptions } from "@/db/schema";
import { getStripe } from "@/lib/stripe";

export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: "Stripe webhook not configured" }, { status: 400 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, secret);
  } catch (err) {
    return NextResponse.json({ error: `Signature check failed: ${err instanceof Error ? err.message : "?"}` }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const leadId = s.metadata?.leadId;
      if (!leadId) break;

      if (s.mode === "payment") {
        await db
          .update(payments)
          .set({ status: "paid", paidAt: new Date(), stripeRef: s.id, note: "Paid via Stripe" })
          .where(and(eq(payments.stripeRef, s.id), eq(payments.status, "pending")));
        await db.update(leads).set({ stage: "won", updatedAt: new Date() }).where(eq(leads.id, leadId));
      } else if (s.mode === "subscription" && s.subscription) {
        const sub = typeof s.subscription === "string" ? { id: s.subscription } : s.subscription;
        await db.insert(subscriptions).values({
          id: crypto.randomUUID(),
          leadId,
          stripeSubscriptionId: sub.id,
          status: "active",
          priceMonthlyCents: s.amount_total ?? 2000,
          currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        });
        await db.update(leads).set({ stage: "live", updatedAt: new Date() }).where(eq(leads.id, leadId));
      }
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const status = event.type === "customer.subscription.deleted" ? "canceled" : sub.status;
      // current_period_end moved into items.data in newer API versions — read defensively
      const rawSub = sub as Stripe.Subscription & { current_period_end?: number };
      const periodEnd = rawSub.current_period_end ?? sub.items.data[0]?.current_period_end;
      await db
        .update(subscriptions)
        .set({ status, currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : undefined })
        .where(eq(subscriptions.stripeSubscriptionId, sub.id));
      break;
    }

    case "invoice.payment_succeeded": {
      const inv = event.data.object as Stripe.Invoice;
      // invoice.subscription became parent.subscription_details.subscription in newer API versions
      const rawInv = inv as Stripe.Invoice & { subscription?: string | null };
      const subscriptionId =
        rawInv.subscription ?? (inv.parent as { subscription_details?: { subscription?: string } } | undefined)?.subscription_details?.subscription ?? null;
      if (!subscriptionId) break;
      const rows = await db.select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, subscriptionId)).limit(1);
      const row = rows[0];
      if (row) {
        await db.insert(payments).values({
          id: crypto.randomUUID(),
          leadId: row.leadId,
          kind: "maintenance",
          method: "stripe",
          amountCents: inv.amount_paid ?? row.priceMonthlyCents,
          status: "paid",
          paidAt: new Date(),
          stripeRef: inv.id ?? "",
          note: "Care plan renewal",
        });
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
