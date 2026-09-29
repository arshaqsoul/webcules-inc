/* Invoices (WEB-137) — numbered per studio, branded PDF to R2, secure token
 * links (the grant pattern: 256-bit token, SHA-256 hash lookup, AES-GCM
 * token_enc for re-email), draft→sent→paid/void lifecycle. */
import { and, eq, sql } from "drizzle-orm";

import { getDb } from "./db";
import { clientUrl } from "./client-urls";
import * as schema from "./db-schema";
import { encryptToken, hashToken, mintToken } from "./shares/grants";
import { putObject } from "./storage/service";
import { renderInvoicePdf, type PdfLine } from "./pdf";
import { sendEmail, invoiceEmail } from "./email";
import { isWhiteLabeled } from "./branding";
import { getPlanEntitlements } from "./plans";
import { getStudioProfile } from "./repos/studios";
import { safeHexColor } from "./embed";
import { getStripe } from "./stripe";

export type InvoiceLine = { description: string; qty: number; amountMinor: number };

export type InvoiceRow = typeof schema.invoices.$inferSelect;

/** Sequential per-org number — one atomic upsert-and-increment; gaps only on
 * voided invoices (standard accounting behavior). Format: 2026-0001. */
async function nextInvoiceNumber(organizationId: string): Promise<string> {
  const db = getDb();
  // Drizzle's typed upsert-with-returning — the raw `db.all(INSERT…RETURNING)`
  // form silently stopped executing after a drizzle upgrade, minting
  // duplicate numbers into a unique-violation 500.
  const rows = await db
    .insert(schema.orgCounters)
    .values({ organizationId, invoiceSeq: 1 })
    .onConflictDoUpdate({
      target: schema.orgCounters.organizationId,
      set: { invoiceSeq: sql`${schema.orgCounters.invoiceSeq} + 1` },
    })
    .returning({ seq: schema.orgCounters.invoiceSeq });
  const seq = rows[0]?.seq ?? 1;
  return `${new Date().getUTCFullYear()}-${String(seq).padStart(4, "0")}`;
}

export async function createInvoice(params: {
  organizationId: string;
  projectId: string;
  lines: InvoiceLine[];
  dueAt?: Date | null;
  clientEmail?: string | null;
}): Promise<InvoiceRow> {
  const db = getDb();
  const totalMinor = params.lines.reduce((n, l) => n + (l.qty > 0 ? l.amountMinor * l.qty : l.amountMinor), 0);
  const id = crypto.randomUUID();
  const number = await nextInvoiceNumber(params.organizationId);
  await db.insert(schema.invoices).values({
    id,
    organizationId: params.organizationId,
    projectId: params.projectId,
    number,
    status: "draft",
    lines: JSON.stringify(params.lines),
    totalMinor,
    currency: "usd",
    dueAt: params.dueAt ?? null,
    clientEmail: params.clientEmail?.toLowerCase() ?? null,
  });
  return (await getInvoice(params.organizationId, id))!;
}

export async function getInvoice(organizationId: string, invoiceId: string): Promise<InvoiceRow | null> {
  const rows = await getDb()
    .select()
    .from(schema.invoices)
    .where(and(eq(schema.invoices.organizationId, organizationId), eq(schema.invoices.id, invoiceId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listProjectInvoices(organizationId: string, projectId: string): Promise<InvoiceRow[]> {
  return getDb()
    .select()
    .from(schema.invoices)
    .where(and(eq(schema.invoices.organizationId, organizationId), eq(schema.invoices.projectId, projectId)))
    .orderBy(sql`${schema.invoices.createdAt} DESC`);
}

async function generateAndArchivePdf(invoice: InvoiceRow, projectTitle: string | null): Promise<string> {
  const profile = await getStudioProfile(invoice.organizationId);
  const brand = JSON.parse(profile?.brand || "{}") as { accent?: string };
  const pdf = await renderInvoicePdf({
    studioName: profile?.studioName ?? "Studio",
    accent: safeHexColor(brand.accent) ?? "#5e6ad2",
    invoiceNumber: invoice.number,
    issuedAt: invoice.issuedAt ?? new Date(),
    dueAt: invoice.dueAt,
    clientEmail: invoice.clientEmail,
    projectTitle,
    lines: JSON.parse(invoice.lines) as PdfLine[],
    totalMinor: invoice.totalMinor,
    currency: invoice.currency,
    status: invoice.status,
    whiteLabel: isWhiteLabeled(await getPlanEntitlements(invoice.organizationId), profile?.brand),
  });
  // putObject takes the org-relative suffix and prefixes {orgId}/ itself.
  const suffix = `${invoice.projectId}/invoices/${invoice.id}.pdf`;
  await putObject(invoice.organizationId, suffix, pdf.slice().buffer as ArrayBuffer, "application/pdf");
  return `${invoice.organizationId}/${suffix}`;
}

/** WEB-174: mint a persistent Stripe Payment Link for the invoice total —
 * on the studio's connected account when live (direct charge, no platform
 * fee), falling back to the platform account otherwise. Links don't expire
 * (checkout sessions cap at 24h, invoices live longer). */
async function createInvoicePaymentLink(organizationId: string, invoice: InvoiceRow): Promise<{ url: string; id: string } | null> {
  const stripe = await getStripe();
  if (!stripe) return null;
  const profile = await getStudioProfile(organizationId);
  const connected =
    profile?.stripeAccountId && profile.stripeConnectState === "active"
      ? { stripeAccount: profile.stripeAccountId }
      : undefined;
  const studioLabel = profile?.studioName ?? "Studio";
  const lineItem = async (opts: { stripeAccount?: string } | undefined) => {
    const price = await stripe.prices.create(
      {
        currency: invoice.currency,
        unit_amount: invoice.totalMinor,
        product_data: { name: `Invoice ${invoice.number} — ${studioLabel}` },
      },
      opts,
    );
    return stripe.paymentLinks.create(
      {
        line_items: [{ price: price.id, quantity: 1 }],
        metadata: { kind: "invoice", invoiceId: invoice.id, organizationId },
      },
      opts,
    );
  };
  try {
    const link = await lineItem(connected);
    return { url: link.url, id: link.id };
  } catch (err) {
    if (!connected) {
      console.error("invoice payment link create failed:", String(err));
      return null;
    }
    console.error("connect payment link failed — falling back to platform:", String(err));
    try {
      const link = await lineItem(undefined);
      return { url: link.url, id: link.id };
    } catch {
      return null;
    }
  }
}

/** Draft → sent: generate + archive the branded PDF, mint the access token,
 * attach the payment link, email the client their secure link. */
export async function sendInvoice(organizationId: string, invoiceId: string): Promise<
  { ok: true; url: string } | { ok: false; error: "not_found" | "already_sent" | "no_recipient" | "email_failed" | "due_in_past" }
> {
  const db = getDb();
  const invoice = await getInvoice(organizationId, invoiceId);
  if (!invoice) return { ok: false, error: "not_found" };
  if (invoice.status !== "draft") return { ok: false, error: "already_sent" };
  if (!invoice.clientEmail) return { ok: false, error: "no_recipient" };
  // Issued is stamped at send time — a due date already in the past would
  // render an invoice that's due before it was issued.
  if (invoice.dueAt && invoice.dueAt.getTime() < Date.now()) return { ok: false, error: "due_in_past" };

  const [project] = await db.select({ title: schema.projects.title }).from(schema.projects).where(eq(schema.projects.id, invoice.projectId)).limit(1);
  const pdfKey = await generateAndArchivePdf(invoice, project?.title ?? null);
  const paymentLink = await createInvoicePaymentLink(organizationId, invoice);

  const token = mintToken();
  const tokenHash = await hashToken(token);
  const tokenEnc = await encryptToken(token);

  await db
    .update(schema.invoices)
    .set({
      status: "sent",
      issuedAt: new Date(),
      pdfKey,
      accessTokenHash: tokenHash,
      tokenEnc,
      ...(paymentLink ? { paymentUrl: paymentLink.url, stripePaymentLinkId: paymentLink.id } : {}),
    })
    .where(and(eq(schema.invoices.organizationId, organizationId), eq(schema.invoices.id, invoiceId)));

  const profile = await getStudioProfile(organizationId);
  const brand = JSON.parse(profile?.brand || "{}") as { accent?: string };
  const url = await clientUrl(organizationId, `/inv/${token}`);
  const wl = isWhiteLabeled(await getPlanEntitlements(organizationId), profile?.brand);
  const tmpl = invoiceEmail(profile?.studioName ?? "the studio", {
    accent: safeHexColor(brand.accent) ?? "#5e6ad2",
    invoiceNumber: invoice.number,
    amountLabel: new Intl.NumberFormat("en-US", { style: "currency", currency: invoice.currency.toUpperCase() }).format(invoice.totalMinor / 100),
    dueLabel: invoice.dueAt ? invoice.dueAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : null,
    invoiceUrl: url,
    whiteLabel: wl,
  });
  const sent = await sendEmail({
    to: invoice.clientEmail,
    subject: tmpl.subject,
    html: tmpl.html,
    text: tmpl.text,
    ...(wl ? { fromName: profile?.studioName ?? undefined } : {}),
    organizationId,
    template: "invoice.sent",
    refId: invoiceId,
  });
  if (!sent) return { ok: false, error: "email_failed" };

  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId,
    actorType: "user",
    action: "invoice.sent",
    targetType: "project",
    targetId: invoice.projectId,
    meta: JSON.stringify({ invoiceId, number: invoice.number }),
  });
  return { ok: true, url };
}

export async function setInvoiceStatus(
  organizationId: string,
  invoiceId: string,
  status: "paid" | "void",
): Promise<{ ok: true } | { ok: false; error: "not_found" }> {
  const db = getDb();
  const invoice = await getInvoice(organizationId, invoiceId);
  if (!invoice) return { ok: false, error: "not_found" };
  // Voiding kills the payment link too — a stale link must not stay payable.
  if (status === "void" && invoice.stripePaymentLinkId) {
    const stripe = await getStripe();
    if (stripe) {
      await stripe.paymentLinks
        .update(invoice.stripePaymentLinkId, { active: false })
        .catch((err) => console.error("payment link deactivate failed:", String(err)));
    }
  }
  await db
    .update(schema.invoices)
    .set({ status })
    .where(and(eq(schema.invoices.organizationId, organizationId), eq(schema.invoices.id, invoiceId)));
  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId,
    actorType: "user",
    action: `invoice.${status}`,
    targetType: "project",
    targetId: invoice.projectId,
    meta: JSON.stringify({ invoiceId, number: invoice.number }),
  });
  return { ok: true };
}

/** Token lookup for the public invoice view (constant-time via hash index). */
export async function resolveInvoiceByToken(token: string): Promise<InvoiceRow | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const rows = await getDb()
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.accessTokenHash, await hashToken(token)))
    .limit(1);
  const invoice = rows[0];
  if (!invoice || invoice.status === "void") return null;
  return invoice;
}

/** PDF bytes for an invoice — staff (org-scoped) or token holders. */
export async function getInvoicePdf(invoice: InvoiceRow): Promise<BodyInit | null> {
  if (!invoice.pdfKey) return null;
  const { getObject } = await import("./storage/service");
  const obj = await getObject(invoice.organizationId, invoice.pdfKey);
  return obj ? (obj.body as ReadableStream) : null;
}

/** WEB-174: a client paid an invoice through its Payment Link — flip the
 * invoice to paid, record the ledger entry, audit. Idempotent: only acts on
 * a sent invoice, so duplicate webhook deliveries are safe. */
export async function markInvoicePaidFromSession(session: {
  id: string;
  payment_intent: string | null;
  amount_total: number | null;
  currency: string | null;
  metadata: Record<string, string | null> | null;
}): Promise<void> {
  const db = getDb();
  const invoiceId = session.metadata?.invoiceId;
  if (!invoiceId) return;
  const invoice = (
    await db.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId)).limit(1)
  )[0];
  if (!invoice || invoice.status !== "sent") return;

  await db.batch([
    db
      .update(schema.invoices)
      .set({ status: "paid" })
      .where(and(eq(schema.invoices.id, invoiceId), eq(schema.invoices.status, "sent"))),
    db.insert(schema.payments).values({
      id: crypto.randomUUID(),
      organizationId: invoice.organizationId,
      projectId: invoice.projectId,
      kind: "invoice",
      amountMinor: session.amount_total ?? invoice.totalMinor,
      currency: session.currency ?? invoice.currency,
      status: "succeeded",
      method: "stripe",
      note: `Invoice ${invoice.number}`,
      stripePaymentIntentId: session.payment_intent,
      occurredAt: new Date(),
    }),
    db.insert(schema.auditLog).values({
      id: crypto.randomUUID(),
      organizationId: invoice.organizationId,
      actorType: "system",
      action: "invoice.paid_online",
      targetType: "project",
      targetId: invoice.projectId,
      meta: JSON.stringify({ invoiceId, number: invoice.number, checkoutSession: session.id }),
    }),
  ]);
}
