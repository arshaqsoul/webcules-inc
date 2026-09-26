/* Payments ledger (WEB-156) — org-scoped reads over the payment table plus
 * the refund action. Refunds are created on the platform (destination charges
 * live on the platform account); the charge.refunded webhook finalizes the
 * row + cancels the booking. */
import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getStripe } from "@/lib/stripe";

export type LedgerEntry = {
  id: string;
  projectId: string;
  projectTitle: string | null;
  kind: string;
  amountMinor: number;
  currency: string;
  status: string;
  stripePaymentIntentId: string | null;
  occurredAt: string | null;
  createdAt: string;
};

export async function listPayments(
  organizationId: string,
  opts: { projectId?: string; limit?: number } = {},
): Promise<LedgerEntry[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.payments.id,
      projectId: schema.payments.projectId,
      projectTitle: schema.projects.title,
      kind: schema.payments.kind,
      amountMinor: schema.payments.amountMinor,
      currency: schema.payments.currency,
      status: schema.payments.status,
      stripePaymentIntentId: schema.payments.stripePaymentIntentId,
      occurredAt: schema.payments.occurredAt,
      createdAt: schema.payments.createdAt,
    })
    .from(schema.payments)
    .leftJoin(schema.projects, eq(schema.projects.id, schema.payments.projectId))
    .where(
      opts.projectId
        ? and(
            eq(schema.payments.organizationId, organizationId),
            eq(schema.payments.projectId, opts.projectId),
          )
        : eq(schema.payments.organizationId, organizationId),
    )
    .orderBy(desc(schema.payments.createdAt))
    .limit(opts.limit ?? 200);

  return rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    projectTitle: r.projectTitle ?? null,
    kind: r.kind,
    amountMinor: r.amountMinor,
    currency: r.currency,
    status: r.status,
    stripePaymentIntentId: r.stripePaymentIntentId ?? null,
    occurredAt: r.occurredAt ? r.occurredAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Issue a Stripe refund; the webhook finalizes status + booking cancel. */
export async function refundPayment(
  organizationId: string,
  paymentId: string,
  actorUserId: string,
): Promise<{ ok: true } | { ok: false; error: "not_found" | "no_intent" | "already_refunded" | "stripe_failed" }> {
  const db = getDb();
  const payment = (
    await db
      .select()
      .from(schema.payments)
      .where(and(eq(schema.payments.id, paymentId), eq(schema.payments.organizationId, organizationId)))
      .limit(1)
  )[0];
  if (!payment) return { ok: false, error: "not_found" };
  if (payment.status === "refunded") return { ok: false, error: "already_refunded" };
  if (!payment.stripePaymentIntentId) return { ok: false, error: "no_intent" };

  const stripe = await getStripe();
  if (!stripe) return { ok: false, error: "stripe_failed" };

  try {
    await stripe.refunds.create({ payment_intent: payment.stripePaymentIntentId });
  } catch (err) {
    console.error("refund create failed:", String(err));
    return { ok: false, error: "stripe_failed" };
  }

  // Flip to "refunding" immediately — the charge.refunded webhook finalizes
  // to "refunded" seconds later; the ledger shouldn't look untouched meanwhile.
  await db
    .update(schema.payments)
    .set({ status: "refunding" })
    .where(eq(schema.payments.id, paymentId));

  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId,
    actorType: "user",
    actorId: actorUserId,
    action: "payment.refund_requested",
    targetType: "payment",
    targetId: paymentId,
    meta: JSON.stringify({ paymentIntent: payment.stripePaymentIntentId, projectId: payment.projectId }),
  });
  return { ok: true };
}
