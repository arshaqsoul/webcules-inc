/* POST /api/embed/forms/{templateId}?key=… (WEB-248) — public schema-driven
 * lead capture. Validation chain mirrors /api/embed/leads (embed key →
 * origin allowlist → honeypot → Turnstile → rate limit) then validates
 * answers against the STORED schema: standard-mapped fields land in lead
 * columns, everything else in lead.custom_fields. Posted schemas are
 * ignored wholesale. */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getEmailBrand } from "@/lib/branding";
import { inquiryAckEmail, inquiryReceivedEmail, sendEmail } from "@/lib/email";
import { originAllowed, resolveStudioByEmbedKey } from "@/lib/embed";
import { mapLeadColumns, parseFormSchema, packLeadCustomFields, validateFormAnswers } from "@/lib/forms";
import { clientIp } from "@/lib/shares/gallery-auth";
import { checkFormRate, verifyFormFileKey } from "@/lib/repos/forms";
import { getStudioProfile } from "@/lib/repos/studios";
import { getTemplate, touchTemplateUsed } from "@/lib/repos/templates";
import { verifyTurnstile } from "@/lib/turnstile";
import { matchSessionTypeByLabel } from "@/lib/repos/session-types";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.company_website === "string" && body.company_website) return Response.json({ ok: true });

  const studio = await resolveStudioByEmbedKey(new URL(req.url).searchParams.get("key") ?? "");
  if (!studio) return Response.json({ error: "invalid_key" }, { status: 404 });

  const embedOrigin = typeof body.embedOrigin === "string" ? body.embedOrigin : "";
  if (!originAllowed(studio, embedOrigin || null)) return Response.json({ error: "origin_not_allowed" }, { status: 403 });
  if (!(await verifyTurnstile(typeof body.turnstileToken === "string" ? body.turnstileToken : null, req.headers.get("CF-Connecting-IP")))) {
    return Response.json({ error: "captcha_failed" }, { status: 403 });
  }
  const ip = clientIp(req);
  if (ip && !(await checkFormRate("submit", ip))) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const template = await getTemplate(studio.organizationId, templateId);
  if (!template || template.archivedAt || (template.kind !== "form" && template.kind !== "questionnaire")) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const formSchema = parseFormSchema(template.body);
  if (!formSchema) return Response.json({ error: "unavailable" }, { status: 404 });
  await touchTemplateUsed(studio.organizationId, template.id);

  const validated = validateFormAnswers(formSchema, body);
  if (!validated.ok) return Response.json({ error: "invalid_answers", fields: validated.errors.map((e) => e.field) }, { status: 400 });

  for (const [fieldId, file] of Object.entries(validated.result.files)) {
    if (!file.token || !(await verifyFormFileKey(studio.organizationId, file.key, file.token))) {
      return Response.json({ error: "invalid_file", field: fieldId }, { status: 400 });
    }
  }

  // Standard columns from the schema mapping; email/name must exist for a lead.
  const { standard, custom } = mapLeadColumns(formSchema);
  const getStd = (col: string): string => {
    const fieldId = standard[col as keyof typeof standard];
    return fieldId ? (validated.result.answers[fieldId] ?? "") : "";
  };
  const name = getStd("name");
  const email = getStd("email").toLowerCase();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }
  const phone = getStd("phone");
  const eventDate = getStd("eventDate");
  const eventType = getStd("eventType");
  const message = getStd("message");
  const customFields = Object.keys(custom).length || Object.keys(validated.result.files).length ? packLeadCustomFields(formSchema, validated.result) : null;

  const db = getDb();
  const existing = (
    await db
      .select()
      .from(schema.leads)
      .where(and(eq(schema.leads.organizationId, studio.organizationId), eq(schema.leads.email, email), eq(schema.leads.status, "new")))
      .limit(1)
  )[0];

  let leadId: string;
  if (existing) {
    leadId = existing.id;
    await db
      .update(schema.leads)
      .set({
        name,
        phone: phone || existing.phone,
        eventDate: eventDate ? new Date(`${eventDate}T12:00:00Z`) : existing.eventDate,
        eventType: eventType || existing.eventType,
        message: message || existing.message,
        embedOrigin: embedOrigin || existing.embedOrigin,
        customFields: customFields ?? existing.customFields,
        updatedAt: new Date(),
      })
      .where(eq(schema.leads.id, existing.id));
  } else {
    leadId = crypto.randomUUID();
    await db.insert(schema.leads).values({
      id: leadId,
      organizationId: studio.organizationId,
      name,
      email,
      phone: phone || null,
      eventDate: eventDate ? new Date(`${eventDate}T12:00:00Z`) : null,
      eventType: eventType || null,
      message: message || null,
      source: template.isDefault ? "contact_form" : template.name.slice(0, 40),
      embedOrigin: embedOrigin || null,
      customFields,
    });
  }

  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: studio.organizationId,
    actorType: "system",
    action: "lead.created",
    targetType: "lead",
    targetId: leadId,
    meta: JSON.stringify({ deduped: Boolean(existing), formTemplateId: template.id }),
  });

  // Notifications — failures never block the visitor's success.
  try {
    const [brand, profile] = await Promise.all([getEmailBrand(studio.organizationId), getStudioProfile(studio.organizationId)]);
    const dashboardUrl = `${new URL(req.url).origin}/dashboard/leads/${leadId}`;
    const studioNotify = inquiryReceivedEmail(
      brand.studioName,
      { name, email, phone: phone || null, eventType: eventType || null, eventDate: eventDate || null, message: message || null },
      dashboardUrl,
      brand.accent,
    );
    await sendEmail({
      to: profile?.contactEmail ?? brand.contactEmail ?? email,
      subject: studioNotify.subject,
      html: studioNotify.html,
      text: studioNotify.text,
      replyTo: email,
      organizationId: studio.organizationId,
      template: "lead.form_received",
      refId: leadId,
    });
    const ack = inquiryAckEmail(brand.studioName, name.split(" ")[0] || "there", brand.accent, brand.whiteLabel, brand.emailHeaderUrl, brand.contactEmail);
    await sendEmail({
      to: email,
      subject: ack.subject,
      html: ack.html,
      text: ack.text,
      ...(brand.whiteLabel ? { fromName: brand.studioName } : {}),
      organizationId: studio.organizationId,
      template: "lead.form_ack",
      refId: leadId,
    });
  } catch {
    /* non-fatal */
  }

  return Response.json({ ok: true });
}
