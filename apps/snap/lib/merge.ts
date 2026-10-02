/* Merge-fields engine (WEB-247) — one registry + one renderer shared by
 * contracts (refactored here from lib/contracts.ts), email templates,
 * invoice notes, booking copy and questionnaire intros.
 *
 * Rules inherited from the original contract behavior: server-side only,
 * unknown {{fields}} pass through untouched so drafts stay editable, and
 * recognized-but-unresolvable fields fall back to human phrases instead of
 * empty holes. Escaping is per surface — link fields become anchors on HTML
 * surfaces, raw text everywhere else. Loop-free by design (no user-defined
 * iteration in v1). */
import { eq } from "drizzle-orm";

import { getDb } from "./db";
import * as schema from "./db-schema";
import { clientUrl } from "./client-urls";
import { getStudioProfile, getStudioSlug } from "./repos/studios";
import { MERGE_FIELDS } from "./merge-fields";
import { businessAddressLine, parseBusiness, taxIdLine } from "./business";

export { MERGE_FIELDS, CONTRACT_MERGE_FIELDS } from "./merge-fields";
export type { MergeField, MergeSurface } from "./merge-fields";


export type MergeContext = {
  organizationId: string;
  projectId?: string | null;
  invoiceId?: string | null;
  /** The surface's client email (contract/invoice recipient) — used for the
   * client_name fallback exactly like contracts did. */
  clientEmail?: string | null;
  /** Caller-resolved values (sign_url after token mint, gallery_link for a
   * specific grant) win over the resolvers. */
  overrides?: Record<string, string>;
};

const FIELD_IDS = new Set(MERGE_FIELDS.map((f) => f.id));

function longDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

async function resolveDeposit(organizationId: string, project: typeof schema.projects.$inferSelect | undefined, override?: string): Promise<string> {
  if (override) return override;
  try {
    const { getBookingSettings } = await import("./repos/availability");
    const settings = await getBookingSettings(organizationId);
    if (settings.payment?.enabled && settings.payment.amountMinor > 0) return formatMoney(settings.payment.amountMinor, "usd");
  } catch {
    /* settings unavailable — fall through */
  }
  return "the deposit as agreed";
}

function formatMoney(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

/** Resolve every registry field from real studio/project/client/invoice
 * data. Only the tables the context points at are read. */
export async function buildMergeValues(ctx: MergeContext): Promise<Record<string, string>> {
  const db = getDb();
  const o = ctx.overrides ?? {};
  const values: Record<string, string> = {};

  const [profile, slug] = await Promise.all([getStudioProfile(ctx.organizationId), getStudioSlug(ctx.organizationId)]);

  let project: typeof schema.projects.$inferSelect | undefined;
  if (ctx.projectId) {
    [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, ctx.projectId)).limit(1);
  }
  let client: typeof schema.clients.$inferSelect | undefined;
  if (project?.clientId) {
    [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, project.clientId)).limit(1);
  }
  let lead: typeof schema.leads.$inferSelect | undefined;
  if (project?.leadId) {
    [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, project.leadId)).limit(1);
  }
  let invoice: typeof schema.invoices.$inferSelect | undefined;
  if (ctx.invoiceId) {
    [invoice] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, ctx.invoiceId)).limit(1);
  }

  const surfaceEmail = (client?.email ?? ctx.clientEmail ?? o.client_email ?? "").toLowerCase();
  values.studio_name = profile?.studioName ?? "the studio";
  values.studio_email = profile?.contactEmail ?? "";
  values.client_name = client?.name ?? (surfaceEmail ? surfaceEmail.split("@")[0] : "the client");
  values.client_email = surfaceEmail;
  values.client_phone = client?.phone ?? "";
  values.project_title = project?.title ?? "your project";
  values.package = project?.title ?? "the package";
  values.event_date = project?.eventDate ? longDate(project.eventDate) : "the scheduled date";
  values.event_date_long = values.event_date;
  // WEB-277: business identity (falls back to the studio name gracefully).
  const business = parseBusiness(profile?.business ?? null, profile?.studioName ?? "the Studio");
  values.studio_legal_name = business.legalName || (profile?.studioName ?? "the Studio");
  values.studio_address = businessAddressLine(business);
  values.studio_tax_id = taxIdLine(business);
  values.studio_phone = business.phone;
  values.studio_website = business.website;
  values.client_legal_name = values.client_name;
  values.total = project?.quotedTotalMinor ? formatMoney(project.quotedTotalMinor, project.quotedCurrency) : "the package total";
  values.deposit = await resolveDeposit(ctx.organizationId, project, o.deposit);
  values.session_type = lead?.eventType?.trim() ?? "your session";
  values.invoice_number = invoice?.number ?? "";
  values.invoice_total = invoice ? formatMoney(invoice.totalMinor, invoice.currency) : "";
  values.today = longDate(new Date());
  values.date = values.today;
  values.booking_link = o.booking_link ?? (slug ? await clientUrl(ctx.organizationId, `/b/${slug}`) : "");
  values.portal_link = o.portal_link ?? await clientUrl(ctx.organizationId, "/portal");
  values.gallery_link = o.gallery_link ?? "your gallery (link to follow)";
  values.sign_url = o.sign_url ?? "";

  // Overrides always win, even for non-link fields.
  for (const [k, v] of Object.entries(o)) {
    if (FIELD_IDS.has(k)) values[k] = v;
  }
  return values;
}

/** Apply merge values to a template — pure renderer lives in merge-fields
 * (client bundles import it); re-exported here for the server surfaces. */
export { renderMerge } from "./merge-fields";
import { renderMerge, type MergeSurface } from "./merge-fields";

/** Resolve + render in one call — the path every runtime surface uses. */
export async function renderMergeFrom(ctx: MergeContext, template: string, opts: { surface: MergeSurface }): Promise<string> {
  return renderMerge(template, await buildMergeValues(ctx), opts);
}
