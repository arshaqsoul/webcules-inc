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
import { hasBusinessIdentity, parseBusiness, taxIdLine } from "./business";
import { renderMergeFrom } from "./merge";
import { fetchEmailHeaderLogo } from "./brand-assets";
import { sendEmail, invoiceEmail } from "./email";
import { getEmailBrand } from "./branding";
import { getStudioProfile } from "./repos/studios";
import { safeHexColor } from "./embed";
import { getStripe } from "./stripe";
import { chargeAccountId, onAccount } from "./connect";
import { emitInboxItem, formatMoney } from "./inbox/sources";

export type InvoiceLine = { description: string; qty: number; amountMinor: number };

export type InvoiceRow = typeof schema.invoices.$inferSelect;

/** Sequential per-org number — one atomic upsert-and-increment; gaps only on
 * voided invoices (standard accounting behavior). Format: 2026-0001. */
async function nextInvoiceNumber(organizationId: string, settings?: import("./invoice-settings").InvoiceSettings): Promise<string> {
  const db = getDb();
  const s = settings ?? (await getStudioInvoiceSettings(organizationId));
  const year = String(new Date().getUTCFullYear());
  if (s.resetYearly) {
    // Per-year counter: first invoice of a year resets the year sequence.
    const rows = await db
      .insert(schema.orgCounters)
      .values({ organizationId, invoiceSeq: 1, invoiceYear: year, invoiceYearSeq: 1 })
      .onConflictDoUpdate({
        target: schema.orgCounters.organizationId,
        set: {
          invoiceSeq: sql`${schema.orgCounters.invoiceSeq} + 1`,
          invoiceYearSeq: sql`CASE WHEN ${schema.orgCounters.invoiceYear} = ${year} THEN ${schema.orgCounters.invoiceYearSeq} + 1 ELSE 1 END`,
          invoiceYear: year,
        },
      })
      .returning({ seq: schema.orgCounters.invoiceYearSeq });
    const seq = rows[0]?.seq ?? 1;
    return `${s.numberPrefix}${year}-${String(seq).padStart(s.numberPadding, "0")}`;
  }
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
  return `${s.numberPrefix}${String(seq).padStart(s.numberPadding, "0")}`;
}

/** The studio's invoice settings (validated defaults when unset). */
export async function getStudioInvoiceSettings(organizationId: string): Promise<import("./invoice-settings").InvoiceSettings> {
  const { getStudioProfile } = await import("./repos/studios");
  const profile = await getStudioProfile(organizationId);
  const { parseInvoiceSettings } = await import("./invoice-settings");
  return parseInvoiceSettings(profile?.invoiceSettings);
}

export async function createInvoice(params: {
  organizationId: string;
  projectId: string;
  lines: InvoiceLine[];
  dueAt?: Date | null;
  clientEmail?: string | null;
  /** WEB-252 per-invoice overrides (defaults snapshot from studio settings). */
  taxLabel?: string | null;
  taxRateBps?: number | null;
  terms?: string | null;
  memo?: string | null;
}): Promise<InvoiceRow> {
  const db = getDb();
  const { subtotalOf, taxFor } = await import("./invoice-settings");
  const subtotal = subtotalOf(params.lines);
  // WEB-252: snapshot the studio's tax/terms at creation — later settings
  // changes never touch existing invoices. Explicit params win over defaults.
  const settings = await getStudioInvoiceSettings(params.organizationId);
  const taxLabel = params.taxLabel !== undefined ? params.taxLabel : settings.taxLabel;
  const taxRateBps = params.taxRateBps !== undefined ? params.taxRateBps : settings.taxRateBps;
  const tax = taxFor(subtotal, taxRateBps || 0);
  const totalMinor = subtotal + tax;
  const id = crypto.randomUUID();
  const number = await nextInvoiceNumber(params.organizationId, settings);
  const dueAt = params.dueAt ?? (settings.dueDays > 0 ? new Date(Date.now() + settings.dueDays * 86_400_000) : null);
  await db.insert(schema.invoices).values({
    id,
    organizationId: params.organizationId,
    projectId: params.projectId,
    number,
    status: "draft",
    lines: JSON.stringify(params.lines),
    totalMinor,
    currency: "usd",
    dueAt,
    clientEmail: params.clientEmail?.toLowerCase() ?? null,
    taxLabel: taxLabel || null,
    taxRateBps: taxRateBps || null,
    terms: (params.terms !== undefined ? params.terms : settings.termsText) || null,
    memo: (params.memo !== undefined ? params.memo : settings.memo) || null,
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
  // WEB-277: legal name/address/tax id on the invoice when configured.
  const biz = parseBusiness(profile?.business ?? null, profile?.studioName ?? "Studio");
  const pdf = await renderInvoicePdf({
    studioName: profile?.studioName ?? "Studio",
    ...(hasBusinessIdentity(biz)
      ? { from: { legalName: biz.legalName, addressLines: biz.addressLines.filter(Boolean), taxLine: taxIdLine(biz) } }
      : {}),
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
    whiteLabel: (await getEmailBrand(invoice.organizationId)).whiteLabel,
    logoPng: (await fetchEmailHeaderLogo(invoice.organizationId, profile?.brandAssets)) ?? undefined,
    taxLabel: invoice.taxLabel,
    taxRateBps: invoice.taxRateBps,
    // Merge fields in terms/memo render with the invoice's own context.
    terms: invoice.terms ? await renderMergeFrom({ organizationId: invoice.organizationId, projectId: invoice.projectId, invoiceId: invoice.id }, invoice.terms, { surface: "plain" }) : null,
    memo: invoice.memo ? await renderMergeFrom({ organizationId: invoice.organizationId, projectId: invoice.projectId, invoiceId: invoice.id }, invoice.memo, { surface: "plain" }) : null,
  });
  // putObject takes the org-relative suffix and prefixes {orgId}/ itself.
  const suffix = `${invoice.projectId}/invoices/${invoice.id}.pdf`;
  await putObject(invoice.organizationId, suffix, pdf.slice().buffer as ArrayBuffer, "application/pdf");
  return `${invoice.organizationId}/${suffix}`;
}

/** WEB-174/WEB-352: mint a persistent Stripe Payment Link for the invoice total
 * ON THE STUDIO'S OWN STRIPE ACCOUNT (direct charge, no platform fee). The studio's
 * Stripe takes the payment and pays the Stripe fee. There is deliberately NO
 * fallback to the platform account: without an active studio account no link is
 * created (null) so client money can never land on Snap. Links don't expire
 * (checkout sessions cap at 24h, invoices live longer). */
async function createInvoicePaymentLink(organizationId: string, invoice: InvoiceRow): Promise<{ url: string; id: string } | null> {
  const stripe = await getStripe();
  if (!stripe) return null;
  const profile = await getStudioProfile(organizationId);
  const account = chargeAccountId(profile);
  if (!account) return null;
  const opts = onAccount(account);
  const studioLabel = profile?.studioName ?? "Studio";
  try {
    const price = await stripe.prices.create(
      {
        currency: invoice.currency,
        unit_amount: invoice.totalMinor,
        product_data: { name: `Invoice ${invoice.number} — ${studioLabel}` },
      },
      opts,
    );
    const link = await stripe.paymentLinks.create(
      {
        line_items: [{ price: price.id, quantity: 1 }],
        metadata: { kind: "invoice", invoiceId: invoice.id, organizationId },
      },
      opts,
    );
    return { url: link.url, id: link.id };
  } catch (err) {
    console.error("invoice payment link create failed:", String(err));
    return null;
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

  const b = await getEmailBrand(organizationId);
  const url = await clientUrl(organizationId, `/inv/${token}`);
  const tmpl = invoiceEmail(b.studioName, {
    accent: b.accent,
    invoiceNumber: invoice.number,
    amountLabel: new Intl.NumberFormat("en-US", { style: "currency", currency: invoice.currency.toUpperCase() }).format(invoice.totalMinor / 100),
    dueLabel: invoice.dueAt ? invoice.dueAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : null,
    invoiceUrl: url,
    whiteLabel: b.whiteLabel,
    emailHeaderUrl: b.emailHeaderUrl,
    contactEmail: b.contactEmail,
  });
  const sent = await sendEmail({
    to: invoice.clientEmail,
    subject: tmpl.subject,
    html: tmpl.html,
    text: tmpl.text,
    ...(b.whiteLabel ? { fromName: b.studioName } : {}),
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
  payment_status?: string | null;
  metadata: Record<string, string | null> | null;
  /** WEB-352: connected account the payment was taken on. */
  stripeAccountId?: string | null;
}): Promise<void> {
  const db = getDb();
  const invoiceId = session.metadata?.invoiceId;
  if (!invoiceId) return;
  const invoice = (
    await db.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId)).limit(1)
  )[0];
  if (!invoice || invoice.status !== "sent") return;
  // (audit fix): only settle on actually-captured money — async methods can
  // complete unsettled, and a mismatched amount means a partial/foreign
  // payment that must not silently flip the invoice to paid.
  if (session.payment_status && session.payment_status !== "paid") return;
  if (session.amount_total !== null && session.amount_total !== invoice.totalMinor) return;

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
      stripeAccountId: session.stripeAccountId ?? null,
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

  // WEB-304: money landed — inbox item on the client's thread.
  await emitInboxItem({
    organizationId: invoice.organizationId,
    kind: "invoice",
    eventType: "invoice.paid",
    entityType: "invoice",
    entityId: invoiceId,
    clientEmail: invoice.clientEmail,
    projectId: invoice.projectId,
    title: `Invoice ${invoice.number} paid`,
    preview: formatMoney(session.amount_total ?? invoice.totalMinor, invoice.currency),
    occurredAt: new Date(),
  });
}
