/* Email copy overrides (WEB-253) — the studio's voice over the system's
 * client-facing emails: per-template subject + intro paragraph, merge-
 * enabled, size-capped and sanitized. The system still renders buttons,
 * links, footer and identity (WEB-240 shell) — an override can only change
 * words, never break the email. Empty override = shipped default,
 * byte-identical. */
import { eq } from "drizzle-orm";

import { getDb } from "./db";
import * as schema from "./db-schema";
import { renderMerge } from "./merge";
import type { MergeContext } from "./merge";
import { sanitizeRichText } from "./sanitize";

export type EmailOverride = { subject?: string; intro?: string };

/** Client-facing templates studios can voice (sendEmail `template` keys). */
export const OVERRIDABLE_TEMPLATES: Array<{ key: string; label: string }> = [
  { key: "lead.ack", label: "Inquiry acknowledgment" },
  { key: "lead.form_ack", label: "Form acknowledgment" },
  { key: "booking.confirmed_client", label: "Booking confirmed (client)" },
  { key: "booking.canceled_client", label: "Booking canceled" },
  { key: "booking.rescheduled_client", label: "Booking rescheduled (client)" },
  { key: "booking.refund_client", label: "Refund issued" },
  { key: "gallery_link", label: "Gallery delivered" },
  { key: "invoice.sent", label: "Invoice sent" },
  { key: "contract.sign_request", label: "Contract — signature request" },
  { key: "contract.signed", label: "Contract signed" },
  { key: "portal.login_code", label: "Portal sign-in code" },
  { key: "questionnaire.link", label: "Questionnaire invitation" },
  { key: "questionnaire.ack", label: "Questionnaire thanks" },
];

export const SUBJECT_CAP = 120;
export const INTRO_CAP = 1000;

export function validateEmailOverridesInput(input: unknown): { ok: true; overrides: Record<string, EmailOverride> } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "invalid_body" };
  const out: Record<string, EmailOverride> = {};
  const known = new Set(OVERRIDABLE_TEMPLATES.map((t) => t.key));
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!known.has(key)) continue; // unknown keys are dropped, not fatal
    if (!raw || typeof raw !== "object") return { ok: false, error: "invalid_override" };
    const o: EmailOverride = {};
    const r = raw as Record<string, unknown>;
    if (r.subject !== undefined) {
      if (typeof r.subject !== "string" || r.subject.length > SUBJECT_CAP) return { ok: false, error: "invalid_subject" };
      const subject = r.subject.trim();
      if (subject) o.subject = subject;
    }
    if (r.intro !== undefined) {
      if (typeof r.intro !== "string" || r.intro.length > INTRO_CAP) return { ok: false, error: "invalid_intro" };
      const intro = r.intro.trim();
      if (intro) o.intro = sanitizeRichText(intro);
    }
    if (o.subject || o.intro) out[key] = o;
  }
  return { ok: true, overrides: out };
}

export async function loadEmailOverrides(organizationId: string): Promise<Record<string, EmailOverride>> {
  const rows = await getDb()
    .select({ overrides: schema.studioProfiles.emailOverrides })
    .from(schema.studioProfiles)
    .where(eq(schema.studioProfiles.organizationId, organizationId))
    .limit(1);
  const raw = rows[0]?.overrides;
  if (!raw) return {};
  const validated = validateEmailOverridesInput(safeParse(raw));
  return validated.ok ? validated.overrides : {};
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function saveEmailOverrides(organizationId: string, input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const validated = validateEmailOverridesInput(input);
  if (!validated.ok) return validated;
  await getDb()
    .update(schema.studioProfiles)
    .set({ emailOverrides: JSON.stringify(validated.overrides), updatedAt: new Date() })
    .where(eq(schema.studioProfiles.organizationId, organizationId));
  return { ok: true };
}

/** Apply one template's override to a rendered email. Merge fields resolve
 * against the email's own context (studio + recipient); unknown fields pass
 * through untouched. Returns the input unchanged when no override exists. */
export function applyEmailOverride(
  params: { subject: string; html: string; text: string },
  override: EmailOverride | undefined,
  values: Record<string, string>,
): { subject: string; html: string; text: string } {
  if (!override) return params;
  const subject = override.subject ? renderMerge(override.subject, values, { surface: "plain" }) : params.subject;
  let html = params.html;
  let text = params.text;
  if (override.intro) {
    const introHtml = renderMerge(override.intro, values, { surface: "html-email" });
    const introText = renderMerge(introToText(override.intro), values, { surface: "plain" });
    // Replace the first paragraph of the body cell (the template's intro);
    // templates without a leading <p> get the intro prepended instead.
    const first = /<p[^>]*>[\s\S]*?<\/p>/.exec(html);
    html = first ? html.replace(first[0], introHtml) : introHtml + html;
    text = `${introText}\n\n${text}`;
  }
  return { subject, html, text };
}

function introToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h3|h4|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export type { MergeContext };
