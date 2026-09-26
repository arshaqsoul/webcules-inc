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
  method: string | null;
  note: string | null;
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
      method: schema.payments.method,
      note: schema.payments.note,
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
    method: r.method ?? null,
    note: r.note ?? null,
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

/* ---------------- WEB-135: project payment tracking ---------------- */

export type ManualMethod = "cash" | "etransfer" | "cheque" | "card_offline" | "other";

/** Record an offline payment — lands as succeeded (money already received). */
export async function addManualPayment(params: {
  organizationId: string;
  projectId: string;
  amountMinor: number;
  currency: string;
  method: ManualMethod;
  note?: string | null;
  occurredAt?: Date;
}): Promise<{ ok: true; id: string } | { ok: false; error: "project_not_found" }> {
  const db = getDb();
  const project = (
    await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, params.projectId), eq(schema.projects.organizationId, params.organizationId)))
      .limit(1)
  )[0];
  if (!project) return { ok: false, error: "project_not_found" };

  const id = crypto.randomUUID();
  await db.insert(schema.payments).values({
    id,
    organizationId: params.organizationId,
    projectId: params.projectId,
    kind: "manual",
    amountMinor: params.amountMinor,
    currency: params.currency,
    status: "succeeded",
    method: params.method,
    note: params.note ?? null,
    occurredAt: params.occurredAt ?? new Date(),
  });
  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: params.organizationId,
    actorType: "user",
    action: "payment.manual_added",
    targetType: "project",
    targetId: params.projectId,
    meta: JSON.stringify({ amountMinor: params.amountMinor, method: params.method }),
  });
  return { ok: true, id };
}

/** Void a manual entry (mis-entry). Stripe rows are refunded, not deleted. */
export async function voidManualPayment(organizationId: string, paymentId: string): Promise<{ ok: true } | { ok: false; error: "not_found" | "stripe_payment" }> {
  const db = getDb();
  const row = (
    await db
      .select()
      .from(schema.payments)
      .where(and(eq(schema.payments.id, paymentId), eq(schema.payments.organizationId, organizationId)))
      .limit(1)
  )[0];
  if (!row) return { ok: false, error: "not_found" };
  if (row.stripePaymentIntentId) return { ok: false, error: "stripe_payment" };
  await db.update(schema.payments).set({ status: "refunded", note: `${row.note ?? ""} [voided]`.trim() }).where(eq(schema.payments.id, paymentId));
  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId,
    actorType: "user",
    action: "payment.manual_voided",
    targetType: "project",
    targetId: row.projectId,
    meta: JSON.stringify({ paymentId, amountMinor: row.amountMinor }),
  });
  return { ok: true };
}

export type PaymentSummary = {
  quotedTotalMinor: number | null;
  currency: string;
  collectedMinor: number;
  refundedMinor: number;
  /** unpaid | partial | paid | overpaid | none — derived against the quote. */
  status: "unpaid" | "partial" | "paid" | "overpaid" | "none";
  paymentCount: number;
};

/** Collected = succeeded rows minus fully-refunded rows (refunds subtract).
 * Status derives only when a quoted total is set. */
export async function getProjectPaymentSummary(organizationId: string, projectId: string): Promise<PaymentSummary> {
  const db = getDb();
  const [project] = await db
    .select({ quotedTotalMinor: schema.projects.quotedTotalMinor, quotedCurrency: schema.projects.quotedCurrency })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.organizationId, organizationId)))
    .limit(1);
  const rows = await db
    .select({ amountMinor: schema.payments.amountMinor, status: schema.payments.status })
    .from(schema.payments)
    .where(and(eq(schema.payments.organizationId, organizationId), eq(schema.payments.projectId, projectId)));

  // Refunds/voids flip the whole row out of "succeeded", so collected is
  // already net of them — refundedMinor is display-only.
  const net = rows.filter((r) => r.status === "succeeded").reduce((n, r) => n + r.amountMinor, 0);
  const refundedMinor = rows.filter((r) => r.status === "refunded").reduce((n, r) => n + r.amountMinor, 0);
  const quoted = project?.quotedTotalMinor ?? null;

  let status: PaymentSummary["status"] = "none";
  if (quoted !== null && quoted > 0) {
    if (net <= 0) status = "unpaid";
    else if (net < quoted) status = "partial";
    else if (net === quoted) status = "paid";
    else status = "overpaid";
  }
  return {
    quotedTotalMinor: quoted,
    currency: project?.quotedCurrency ?? "usd",
    collectedMinor: net,
    refundedMinor,
    status,
    paymentCount: rows.length,
  };
}

/** Kanban/board batch — one query, grouped in JS. */
export async function getOrgPaymentStatuses(
  organizationId: string,
): Promise<Map<string, { status: PaymentSummary["status"]; net: number; quoted: number | null }>> {
  const db = getDb();
  const [projectRows, payRows] = await Promise.all([
    db
      .select({ id: schema.projects.id, quoted: schema.projects.quotedTotalMinor })
      .from(schema.projects)
      .where(eq(schema.projects.organizationId, organizationId))
      .limit(500),
    db
      .select({ projectId: schema.payments.projectId, amountMinor: schema.payments.amountMinor, status: schema.payments.status })
      .from(schema.payments)
      .where(eq(schema.payments.organizationId, organizationId))
      .limit(2000),
  ]);
  const map = new Map<string, { status: PaymentSummary["status"]; net: number; quoted: number | null }>();
  for (const p of projectRows) {
    map.set(p.id, { status: p.quoted && p.quoted > 0 ? "unpaid" : "none", net: 0, quoted: p.quoted });
  }
  for (const r of payRows) {
    const cur = map.get(r.projectId);
    if (!cur) continue;
    if (r.status === "succeeded") cur.net += r.amountMinor; // refunds flip rows out entirely
  }
  for (const [id, v] of map) {
    if (v.quoted && v.quoted > 0) {
      v.status = v.net <= 0 ? "unpaid" : v.net < v.quoted ? "partial" : v.net === v.quoted ? "paid" : "overpaid";
    } else {
      v.status = v.net > 0 ? "paid" : "none";
    }
    map.set(id, v);
  }
  return map;
}
