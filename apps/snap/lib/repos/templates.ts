/* Template repository (WEB-247) — the store behind every designer in the
 * Brand & Templates epic. Bodies are validated + capped per kind at write
 * time (JSON kinds must parse; email_snippet HTML is sanitized on write),
 * set-default is transactional (one default per org+kind), and counts feed
 * the tier gates. Starter library rows double as the onboarding seed —
 * createStudioForUser spreads starterTemplateRows() into its single batch. */
import { and, eq, isNull, sql } from "drizzle-orm";

import { getDb } from "../db";
import * as schema from "../db-schema";
import { sanitizeRichText } from "../sanitize";
import { DEFAULT_CONTACT_FORM_BODY } from "../forms";
import { GALLERY_DESIGN_MAX_BYTES, parseGalleryDesign, serializeGalleryDesign } from "../gallery-design";

export type TemplateRow = typeof schema.templates.$inferSelect;
export type TemplateInsert = typeof schema.templates.$inferInsert;

export const TEMPLATE_KINDS = ["contract", "contract_clause", "form", "email_snippet", "invoice_preset", "questionnaire", "gallery_preset"] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

/** Body byte caps — D1-row friendly (epic contract: ≤256 KB documents,
 * ≤64 KB schemas). */
const BODY_CAPS: Record<TemplateKind, number> = {
  contract: 256 * 1024,
  contract_clause: 16 * 1024,
  form: 64 * 1024,
  email_snippet: 256 * 1024,
  invoice_preset: 64 * 1024,
  questionnaire: 64 * 1024,
  gallery_preset: GALLERY_DESIGN_MAX_BYTES,
};

const NAME_CAP = 120;
const META_CAP = 16 * 1024;

export function isTemplateKind(kind: string): kind is TemplateKind {
  return (TEMPLATE_KINDS as readonly string[]).includes(kind);
}

/** Validate + normalize a body for its kind. Returns null when invalid. */
export function normalizeTemplateBody(kind: TemplateKind, body: string): string | null {
  const trimmed = body.slice(0, BODY_CAPS[kind] + 1);
  if (trimmed.length > BODY_CAPS[kind]) return null;
  // WEB-258: gallery presets hold a design config — must parse to a valid
  // design; re-serialized canonically (strict body, like the project column).
  if (kind === "gallery_preset") {
    try {
      const design = parseGalleryDesign(JSON.parse(trimmed));
      return design ? serializeGalleryDesign(design) : null;
    } catch {
      return null;
    }
  }
  if (kind === "form" || kind === "invoice_preset" || kind === "questionnaire") {
    try {
      JSON.parse(trimmed);
    } catch {
      return null;
    }
    return trimmed;
  }
  if (kind === "email_snippet") return sanitizeRichText(trimmed);
  // Contracts are plain text by default (whitespace-pre-wrap / PDF text);
  // bodies that carry allowlist HTML are sanitized to the same allowlist the
  // signing page renders with.
  if (/<(p|br|strong|em|u|ul|ol|li|h3|h4|blockquote|a)\b/i.test(trimmed)) return sanitizeRichText(trimmed);
  return trimmed.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

export async function listTemplates(organizationId: string, kind?: TemplateKind, opts: { includeArchived?: boolean } = {}): Promise<TemplateRow[]> {
  const conds = [eq(schema.templates.organizationId, organizationId)];
  if (kind) conds.push(eq(schema.templates.kind, kind));
  if (!opts.includeArchived) conds.push(isNull(schema.templates.archivedAt));
  return getDb()
    .select()
    .from(schema.templates)
    .where(and(...conds))
    .orderBy(sql`${schema.templates.archivedAt} IS NOT NULL`, sql`${schema.templates.isDefault} DESC`, sql`${schema.templates.createdAt} DESC`);
}

export async function getTemplate(organizationId: string, id: string): Promise<TemplateRow | null> {
  const rows = await getDb()
    .select()
    .from(schema.templates)
    .where(and(eq(schema.templates.organizationId, organizationId), eq(schema.templates.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

/** Active (non-archived) count for one kind — the entitlement-gate number. */
export async function countTemplates(organizationId: string, kind: TemplateKind): Promise<number> {
  const rows = await getDb()
    .select({ n: sql<number>`count(*)` })
    .from(schema.templates)
    .where(and(eq(schema.templates.organizationId, organizationId), eq(schema.templates.kind, kind), isNull(schema.templates.archivedAt)));
  return rows[0]?.n ?? 0;
}

/** The org's default template for a kind (null when none is pinned). */
export async function getDefaultTemplate(organizationId: string, kind: TemplateKind): Promise<TemplateRow | null> {
  const rows = await getDb()
    .select()
    .from(schema.templates)
    .where(and(eq(schema.templates.organizationId, organizationId), eq(schema.templates.kind, kind), eq(schema.templates.isDefault, 1), isNull(schema.templates.archivedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export type CreateTemplateParams = {
  organizationId: string;
  kind: TemplateKind;
  name: string;
  body: string;
  meta?: Record<string, unknown>;
  isDefault?: boolean;
};

export type TemplateWriteError = "invalid_kind" | "invalid_name" | "invalid_body" | "invalid_json" | "too_large";

export async function createTemplate(params: CreateTemplateParams): Promise<{ ok: true; template: TemplateRow } | { ok: false; error: TemplateWriteError }> {
  if (!isTemplateKind(params.kind)) return { ok: false, error: "invalid_kind" };
  const name = params.name.trim().slice(0, NAME_CAP);
  if (!name) return { ok: false, error: "invalid_name" };
  const metaJson = JSON.stringify(params.meta ?? {});
  if (metaJson.length > META_CAP) return { ok: false, error: "too_large" };
  const body = normalizeTemplateBody(params.kind, params.body);
  if (body === null) {
    return { ok: false, error: params.body.length > BODY_CAPS[params.kind] ? "too_large" : params.kind === "email_snippet" ? "invalid_body" : "invalid_json" };
  }
  const db = getDb();
  const id = crypto.randomUUID();
  const others = and(
    eq(schema.templates.organizationId, params.organizationId),
    eq(schema.templates.kind, params.kind),
    sql`${schema.templates.id} <> ${id}`,
  );
  await db.batch(
    params.isDefault
      ? [
          db.insert(schema.templates).values({
            id,
            organizationId: params.organizationId,
            kind: params.kind,
            name,
            body,
            meta: metaJson,
            isDefault: 1,
          }),
          db.update(schema.templates).set({ isDefault: 0 }).where(others),
        ]
      : [
          db.insert(schema.templates).values({
            id,
            organizationId: params.organizationId,
            kind: params.kind,
            name,
            body,
            meta: metaJson,
          }),
        ],
  );
  return { ok: true, template: (await getTemplate(params.organizationId, id))! };
}

export async function updateTemplate(
  organizationId: string,
  id: string,
  patch: { name?: string; body?: string; meta?: Record<string, unknown> },
): Promise<{ ok: true; template: TemplateRow } | { ok: false; error: TemplateWriteError | "not_found" }> {
  const existing = await getTemplate(organizationId, id);
  if (!existing) return { ok: false, error: "not_found" };
  const kind = existing.kind as TemplateKind;
  const set: Partial<TemplateInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    const name = patch.name.trim().slice(0, NAME_CAP);
    if (!name) return { ok: false, error: "invalid_name" };
    set.name = name;
  }
  if (patch.body !== undefined) {
    const body = normalizeTemplateBody(kind, patch.body);
    if (body === null) {
      return { ok: false, error: patch.body.length > BODY_CAPS[kind] ? "too_large" : kind === "email_snippet" ? "invalid_body" : "invalid_json" };
    }
    set.body = body;
  }
  if (patch.meta !== undefined) {
    const metaJson = JSON.stringify(patch.meta);
    if (metaJson.length > META_CAP) return { ok: false, error: "too_large" };
    set.meta = metaJson;
  }
  await getDb()
    .update(schema.templates)
    .set(set)
    .where(and(eq(schema.templates.organizationId, organizationId), eq(schema.templates.id, id)));
  return { ok: true, template: (await getTemplate(organizationId, id))! };
}

/** One default per org+kind — both statements ride a single D1 batch
 * (transactional). */
export async function setDefaultTemplate(organizationId: string, id: string): Promise<{ ok: true } | { ok: false; error: "not_found" }> {
  const existing = await getTemplate(organizationId, id);
  if (!existing || existing.archivedAt) return { ok: false, error: "not_found" };
  const db = getDb();
  await db.batch([
    db
      .update(schema.templates)
      .set({ isDefault: 0 })
      .where(and(eq(schema.templates.organizationId, organizationId), eq(schema.templates.kind, existing.kind))),
    db
      .update(schema.templates)
      .set({ isDefault: 1, archivedAt: null })
      .where(and(eq(schema.templates.organizationId, organizationId), eq(schema.templates.id, id))),
  ]);
  return { ok: true };
}

export async function duplicateTemplate(organizationId: string, id: string): Promise<{ ok: true; template: TemplateRow } | { ok: false; error: "not_found" }> {
  const existing = await getTemplate(organizationId, id);
  if (!existing) return { ok: false, error: "not_found" };
  const newId = crypto.randomUUID();
  const name = `Copy of ${existing.name}`.slice(0, NAME_CAP);
  await getDb().insert(schema.templates).values({
    id: newId,
    organizationId,
    kind: existing.kind,
    name,
    body: existing.body,
    meta: existing.meta,
    isDefault: 0,
  });
  return { ok: true, template: (await getTemplate(organizationId, newId))! };
}

/** Soft delete — the hub can restore; archived defaults release the pin. */
export async function archiveTemplate(organizationId: string, id: string): Promise<{ ok: true } | { ok: false; error: "not_found" }> {
  const existing = await getTemplate(organizationId, id);
  if (!existing) return { ok: false, error: "not_found" };
  await getDb()
    .update(schema.templates)
    .set({ archivedAt: new Date(), isDefault: 0 })
    .where(and(eq(schema.templates.organizationId, organizationId), eq(schema.templates.id, id)));
  return { ok: true };
}

export async function restoreTemplate(organizationId: string, id: string): Promise<{ ok: true } | { ok: false; error: "not_found" }> {
  const existing = await getTemplate(organizationId, id);
  if (!existing) return { ok: false, error: "not_found" };
  await getDb()
    .update(schema.templates)
    .set({ archivedAt: null })
    .where(and(eq(schema.templates.organizationId, organizationId), eq(schema.templates.id, id)));
  return { ok: true };
}

/* ---------------- Starter library ---------------- */

/** The seed every new studio receives (kept in sync with the backfill in
 * migrations/0033_templates.sql). Extras beyond a tier's gates stay dormant
 * rows — visible on upgrade, never deleted. */
export function starterTemplateRows(organizationId: string): TemplateInsert[] {
  const now = new Date();
  const row = (kind: TemplateKind, name: string, body: string, meta: Record<string, unknown> = {}, isDefault = 0): TemplateInsert => ({
    id: crypto.randomUUID(),
    organizationId,
    kind,
    name,
    body,
    meta: JSON.stringify(meta),
    isDefault,
    createdAt: now,
    updatedAt: now,
  });
  return [
    row(
      "contract",
      "Wedding photography agreement",
      `This agreement is between {{studio_name}} ("the Studio") and {{client_name}} ("the Client") for the wedding photography collection described as {{project_title}}.

Coverage. The Studio will photograph the wedding on {{event_date}} as outlined in the collection details shared with the Client.

Delivery. Edited, gallery-ready images are delivered through a private online gallery within six weeks of the wedding date.

Payment. The retainer reserves the date and is applied toward the total. The remaining balance is due one week before the wedding.

Cancellation. If the Client cancels, the retainer is non-refundable. The Studio will make reasonable efforts to rebook the date.

Creative license. The Studio retains the copyright in all images and may share selected images for portfolio use unless the Client requests otherwise in writing.

By signing below, both parties agree to these terms.`,
      {},
      1,
    ),
    row(
      "contract",
      "Portrait session agreement",
      `This portrait session agreement is between {{studio_name}} ("the Studio") and {{client_name}} ("the Client").

Session. The portrait session takes place on {{event_date}} at the agreed location and time.

Delivery. The Client receives a private online gallery of fully edited images within two weeks of the session.

Usage. Personal printing and sharing are included. Commercial use of the images requires written permission from the Studio.

Payment. The session fee is due at booking and reserves the date.

By signing below, both parties agree to these terms.`,
    ),
    row("form", "General intake", DEFAULT_CONTACT_FORM_BODY, {}, 1),
    row(
      "email_snippet",
      "Inquiry reply",
      `<p>Hi {{client_name}},</p>
<p>thank you for reaching out — it would be great to hear more about {{project_title}}. I will come back to you within one business day with availability and collections.</p>
<p>Talk soon,<br>{{studio_name}}</p>`,
      { subject: "Thank you for reaching out to {{studio_name}}" },
      1,
    ),
    row(
      "email_snippet",
      "Booking — thank you",
      `<p>Hi {{client_name}},</p>
<p>your session on {{event_date}} is confirmed and I am so looking forward to it! If anything changes before then, just reply to this email.</p>
<p>See you soon,<br>{{studio_name}}</p>`,
      { subject: "Your booking is confirmed — {{event_date}}" },
    ),
    row(
      "email_snippet",
      "Gallery delivery note",
      `<p>Hi {{client_name}},</p>
<p>your gallery is ready! View and favorite your images here: {{gallery_link}}</p>
<p>The gallery stays open for 90 days — download your favorites before then.</p>
<p>Enjoy,<br>{{studio_name}}</p>`,
      { subject: "Your photos are ready 🎉" },
    ),
    row("invoice_preset", "Standard terms", "[]", {
      terms: "Payment due within 14 days of the invoice date.",
      notes: "Thank you for your business!",
    }, 1),
    row("invoice_preset", "Wedding Collection", JSON.stringify([
      { description: "Full-day wedding coverage (8 hours)", qty: 1, amountMinor: 240000 },
      { description: "Second photographer", qty: 1, amountMinor: 45000 },
      { description: "Album credit", qty: 1, amountMinor: 30000 },
    ])),
    row("invoice_preset", "Portrait Session", JSON.stringify([
      { description: "60-minute portrait session", qty: 1, amountMinor: 25000 },
      { description: "Extra retouched image set (10)", qty: 1, amountMinor: 7500 },
    ])),
    row("invoice_preset", "Mini Session", JSON.stringify([{ description: "20-minute mini session", qty: 1, amountMinor: 12500 }])),
    row("contract_clause", "Image usage & licensing", "All images remain the copyright of the studio. The client receives a personal-use license covering printing, sharing and archiving; commercial use, third-party licensing or AI training requires separate written permission."),
    row("contract_clause", "Weather policy", "If conditions make outdoor photography unsafe or unreasonably difficult, the studio and client will agree on a new date within 60 days at no additional charge."),
    row("contract_clause", "Retainer non-refundable", "The retainer reserves the date exclusively and is non-refundable, though it may be transferred once to a new date if the client reschedules at least 30 days in advance."),
    row("contract_clause", "Delivery timeline", "Edited images are delivered through a private online gallery within six weeks of the session date. Sneak peeks may arrive sooner at the studio's discretion."),
    row("contract_clause", "Cancellation by studio", "If the studio cannot attend due to illness, emergency or force majeure, all payments made will be refunded in full within 10 business days, or a comparable replacement photographer may be offered."),
    row(
      "questionnaire",
      "Client questionnaire",
      JSON.stringify({
        v: 1,
        title: "A few questions",
        intro: "Your answers help us plan the session perfectly.",
        thankYou: "Thank you — your answers are in!",
        fields: [
          { id: "f_name", kind: "text", label: "Your name", required: true, half: true },
          { id: "f_email", kind: "email", label: "Email", required: true, half: true },
          { id: "f_phone", kind: "phone", label: "Best phone for day-of", required: false, half: true },
          { id: "f_date", kind: "date", label: "Session date (if set)", required: false, half: true },
          { id: "f_venue", kind: "text", label: "Venue / location", required: false, help: "Address or name of the place", half: true },
          { id: "f_arrival", kind: "text", label: "Who should we ask for on arrival?", required: false, half: true },
          { id: "f_style", kind: "select", label: "Which photos matter most?", required: false, options: ["Candids + in-between moments", "Formal groupings", "Couple portraits", "Detail shots", "A mix of everything"] },
          { id: "f_must", kind: "textarea", label: "Any must-have shots?", required: false, help: "Family groupings, heirlooms, pets — anything that simply can't be missed" },
          { id: "f_notes", kind: "textarea", label: "Anything else we should know?", required: false },
        ],
      }),
      {},
      1,
    ),
    // WEB-258: starter gallery presets — none pinned default (a fresh org's
    // galleries keep the classic look until the studio chooses one).
    row("gallery_preset", "Editorial dark", JSON.stringify({
      cover: { assetId: "", focal: { x: 0.5, y: 0.4 }, style: "kenburns", title: "{{client_name}}", subtitle: "A film from your day with {{studio_name}}" },
      layout: "cascade",
      theme: { background: "dark", padding: "normal", radius: "0px", captions: "hover" },
    })),
    row("gallery_preset", "Clean light", JSON.stringify({
      cover: { assetId: "", focal: { x: 0.5, y: 0.5 }, style: "static", title: "Your photos are ready", subtitle: "for {{client_name}} · {{event_date}}" },
      layout: "grid",
      theme: { background: "light", padding: "normal", radius: "16px", captions: "off" },
    })),
    row("gallery_preset", "Brand story", JSON.stringify({
      cover: { assetId: "", focal: { x: 0.5, y: 0.35 }, style: "split", title: "{{client_name}}", subtitle: "captured by {{studio_name}}" },
      layout: "masonry",
      theme: { background: "brand", padding: "airy", radius: "8px", captions: "hover" },
    })),
  ];
}

/** Onboarding seed — skips orgs that already own any template. */
export async function seedStarterTemplates(organizationId: string): Promise<number> {
  const existing = await countAllTemplates(organizationId);
  if (existing > 0) return 0;
  const rows = starterTemplateRows(organizationId);
  // D1 caps bound variables per statement (100) — insert in chunks of 9 rows.
  for (let i = 0; i < rows.length; i += 9) {
    await getDb().insert(schema.templates).values(rows.slice(i, i + 9));
  }
  return rows.length;
}

async function countAllTemplates(organizationId: string): Promise<number> {
  const rows = await getDb()
    .select({ n: sql<number>`count(*)` })
    .from(schema.templates)
    .where(eq(schema.templates.organizationId, organizationId));
  return rows[0]?.n ?? 0;
}

/* ---------------- Hub additions (WEB-255) ---------------- */

/** Mark a template used (submissions/applications). Never throws — telemetry. */
export async function touchTemplateUsed(organizationId: string, id: string): Promise<void> {
  try {
    await getDb()
      .update(schema.templates)
      .set({ lastUsedAt: new Date() })
      .where(and(eq(schema.templates.organizationId, organizationId), eq(schema.templates.id, id)));
  } catch {
    /* telemetry only */
  }
}

/** Usage count for delete protection: form/questionnaire templates have real
 * linkage (form_response rows); other kinds count by last-used. */
export async function countTemplateUsage(organizationId: string, id: string, kind: TemplateKind): Promise<number> {
  const db = getDb();
  if (kind === "form" || kind === "questionnaire") {
    const rows = await db
      .select({ n: sql<number>`count(*)` })
      .from(schema.formResponses)
      .where(and(eq(schema.formResponses.organizationId, organizationId), eq(schema.formResponses.templateId, id)));
    return rows[0]?.n ?? 0;
  }
  const rows = await db
    .select({ used: schema.templates.lastUsedAt })
    .from(schema.templates)
    .where(and(eq(schema.templates.organizationId, organizationId), eq(schema.templates.id, id)))
    .limit(1);
  return rows[0]?.used ? 1 : 0;
}

/** Hard delete — refused while in use (archive is always available). */
export async function hardDeleteTemplate(organizationId: string, id: string): Promise<{ ok: true } | { ok: false; error: "not_found" | "in_use" }> {
  const existing = await getTemplate(organizationId, id);
  if (!existing) return { ok: false, error: "not_found" };
  const usage = await countTemplateUsage(organizationId, id, existing.kind as TemplateKind);
  if (usage > 0) return { ok: false, error: "in_use" };
  await getDb().delete(schema.templates).where(and(eq(schema.templates.organizationId, organizationId), eq(schema.templates.id, id)));
  return { ok: true };
}

/** Re-seed missing starter rows only — existing rows (edited or not) are
 * never touched. Returns how many were re-added. */
export async function restoreMissingStarters(organizationId: string): Promise<number> {
  const db = getDb();
  const existing = await db
    .select({ kind: schema.templates.kind, name: schema.templates.name })
    .from(schema.templates)
    .where(eq(schema.templates.organizationId, organizationId));
  const have = new Set(existing.map((r) => `${r.kind}::${r.name}`));
  const missing = starterTemplateRows(organizationId).filter((r) => !have.has(`${r.kind}::${r.name}`));
  for (let i = 0; i < missing.length; i += 9) {
    await db.insert(schema.templates).values(missing.slice(i, i + 9));
  }
  return missing.length;
}
