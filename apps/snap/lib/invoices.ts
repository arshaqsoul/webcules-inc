/* Invoices (WEB-137) — numbered per studio, branded PDF to R2, secure token
 * links (the grant pattern: 256-bit token, SHA-256 hash lookup, AES-GCM
 * token_enc for re-email), draft→sent→paid/void lifecycle. */
import { and, eq, sql } from "drizzle-orm";

import { getDb } from "./db";
import * as schema from "./db-schema";
import { encryptToken, hashToken, mintToken } from "./shares/grants";
import { putObject } from "./storage/service";
import { renderInvoicePdf, type PdfLine } from "./pdf";
import { sendEmail, invoiceEmail } from "./email";
import { getStudioProfile } from "./repos/studios";
import { safeHexColor } from "./embed";

export type InvoiceLine = { description: string; qty: number; amountMinor: number };

export type InvoiceRow = typeof schema.invoices.$inferSelect;

/** Sequential per-org number — one atomic upsert-and-increment; gaps only on
 * voided invoices (standard accounting behavior). Format: 2026-0001. */
async function nextInvoiceNumber(organizationId: string): Promise<string> {
  const db = getDb();
  const rows = await db.all<{ seq: number }>(sql`
    INSERT INTO org_counter (organization_id, invoice_seq) VALUES (${organizationId}, 1)
    ON CONFLICT (organization_id) DO UPDATE SET invoice_seq = invoice_seq + 1
    RETURNING invoice_seq
  `);
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
  });
  // putObject takes the org-relative suffix and prefixes {orgId}/ itself.
  const suffix = `${invoice.projectId}/invoices/${invoice.id}.pdf`;
  await putObject(invoice.organizationId, suffix, pdf.slice().buffer as ArrayBuffer, "application/pdf");
  return `${invoice.organizationId}/${suffix}`;
}

/** Draft → sent: generate + archive the branded PDF, mint the access token,
 * email the client their secure link. */
export async function sendInvoice(organizationId: string, invoiceId: string): Promise<
  { ok: true; url: string } | { ok: false; error: "not_found" | "already_sent" | "no_recipient" | "email_failed" }
> {
  const db = getDb();
  const invoice = await getInvoice(organizationId, invoiceId);
  if (!invoice) return { ok: false, error: "not_found" };
  if (invoice.status !== "draft") return { ok: false, error: "already_sent" };
  if (!invoice.clientEmail) return { ok: false, error: "no_recipient" };

  const [project] = await db.select({ title: schema.projects.title }).from(schema.projects).where(eq(schema.projects.id, invoice.projectId)).limit(1);
  const pdfKey = await generateAndArchivePdf(invoice, project?.title ?? null);

  const token = mintToken();
  const tokenHash = await hashToken(token);
  const tokenEnc = await encryptToken(token);

  await db
    .update(schema.invoices)
    .set({ status: "sent", issuedAt: new Date(), pdfKey, accessTokenHash: tokenHash, tokenEnc })
    .where(and(eq(schema.invoices.organizationId, organizationId), eq(schema.invoices.id, invoiceId)));

  const profile = await getStudioProfile(organizationId);
  const brand = JSON.parse(profile?.brand || "{}") as { accent?: string };
  const url = `https://snap.webcules.com/inv/${token}`;
  const tmpl = invoiceEmail(profile?.studioName ?? "the studio", {
    accent: safeHexColor(brand.accent) ?? "#5e6ad2",
    invoiceNumber: invoice.number,
    amountLabel: new Intl.NumberFormat("en-US", { style: "currency", currency: invoice.currency.toUpperCase() }).format(invoice.totalMinor / 100),
    dueLabel: invoice.dueAt ? invoice.dueAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : null,
    invoiceUrl: url,
  });
  const sent = await sendEmail({
    to: invoice.clientEmail,
    subject: tmpl.subject,
    html: tmpl.html,
    text: tmpl.text,
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
