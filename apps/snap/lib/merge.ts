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

export type MergeSurface = "plain" | "pdf-text" | "html" | "html-email";

export type MergeField = {
  id: string;
  label: string;
  description: string;
  /** Renders a URL — auto-linked on HTML surfaces. */
  link?: boolean;
  /** Contract-era alias kept so existing drafts keep resolving. */
  legacy?: boolean;
};

/** The registry — also feeds every designer's {{…}} picker. */
export const MERGE_FIELDS: MergeField[] = [
  { id: "client_name", label: "Client name", description: "The client's display name" },
  { id: "client_email", label: "Client email", description: "The client's email address" },
  { id: "client_phone", label: "Client phone", description: "The client's phone number, when known" },
  { id: "studio_name", label: "Studio name", description: "Your studio's name" },
  { id: "studio_email", label: "Studio email", description: "Your contact email" },
  { id: "project_title", label: "Project", description: "The project or collection title" },
  { id: "event_date", label: "Event date", description: "The project's event date (e.g. June 14, 2027)" },
  { id: "session_type", label: "Session type", description: "The booked session type (Wedding, Mini…)" },
  { id: "invoice_number", label: "Invoice number", description: "The invoice's number (e.g. INV-014)" },
  { id: "invoice_total", label: "Invoice total", description: "The invoice total with currency" },
  { id: "today", label: "Today", description: "Today's date" },
  { id: "booking_link", label: "Booking link", description: "Your public booking page", link: true },
  { id: "gallery_link", label: "Gallery link", description: "The client's gallery link", link: true },
  { id: "portal_link", label: "Portal link", description: "The client portal sign-in", link: true },
  { id: "sign_url", label: "Signing link", description: "The contract's signing link", link: true },
  // Legacy contract aliases ({{date}}, {{package}}) — resolvers identical to
  // today's mergeContractBody so existing drafts are unchanged.
  { id: "date", label: "Today", description: "Today's date", legacy: true },
  { id: "package", label: "Project", description: "The project or collection title", legacy: true },
];

/** The five fields the contract composer offers (WEB-158 set + order). */
export const CONTRACT_MERGE_FIELDS = ["client_name", "studio_name", "date", "event_date", "package"]
  .map((id) => MERGE_FIELDS.find((f) => f.id === id))
  .filter((f): f is MergeField => Boolean(f));

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
const LINK_FIELDS = new Set(MERGE_FIELDS.filter((f) => f.link).map((f) => f.id));

function escapeHtmlValue(s: string): string {
  return s.replace(/&(?!(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]{1,31});)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttrValue(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function longDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
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

/** Apply merge values to a template. Unknown fields pass through untouched
 * (drafts stay editable); escaping is per surface. */
export function renderMerge(template: string, values: Record<string, string>, opts: { surface: MergeSurface }): string {
  const htmlSurface = opts.surface === "html" || opts.surface === "html-email";
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (full, rawName: string) => {
    const name = rawName.toLowerCase();
    if (!(name in values)) return full; // unknown → untouched
    const value = values[name];
    if (!htmlSurface) return value; // plain / pdf-text: raw, exactly like contracts today
    if (LINK_FIELDS.has(name) && /^(https:\/\/|mailto:)/i.test(value)) {
      return `<a href="${escapeAttrValue(value)}" target="_blank" rel="noopener noreferrer">${escapeHtmlValue(value)}</a>`;
    }
    return escapeHtmlValue(value);
  });
}

/** Resolve + render in one call — the path every runtime surface uses. */
export async function renderMergeFrom(ctx: MergeContext, template: string, opts: { surface: MergeSurface }): Promise<string> {
  return renderMerge(template, await buildMergeValues(ctx), opts);
}
