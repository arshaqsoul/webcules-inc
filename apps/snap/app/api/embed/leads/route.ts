/* Public lead capture from the embeddable contact form.
 * Validation chain: embed key → embed origin (referrer-derived, per-studio
 * allowlist) → honeypot → zod payload. Dedupes open leads by email; notifies
 * the studio + acknowledges the client. Turnstile lands with hardening. */
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getAuth } from "@/lib/auth.server";
import { inquiryAckEmail, inquiryReceivedEmail, sendEmail } from "@/lib/email";
import { originAllowed, resolveStudioByEmbedKey, safeHexColor } from "@/lib/embed";

export const dynamic = "force-dynamic";

const leadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  eventDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  eventType: z.string().trim().max(40).optional().or(z.literal("")),
  message: z.string().trim().max(4000).optional().or(z.literal("")),
  embedOrigin: z.string().trim().max(200).optional().or(z.literal("")),
  company_website: z.string().optional(), // honeypot — must be empty
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_input" }, { status: 400 });
  const input = parsed.data;
  if (input.company_website) {
    // Honeypot tripped — pretend success so bots learn nothing.
    return Response.json({ ok: true });
  }

  const url = new URL(req.url);
  const studio = await resolveStudioByEmbedKey(url.searchParams.get("key") ?? "");
  if (!studio) return Response.json({ error: "invalid_key" }, { status: 404 });

  if (!originAllowed(studio, input.embedOrigin || null)) {
    return Response.json({ error: "origin_not_allowed" }, { status: 403 });
  }

  const db = getDb();
  const email = input.email.toLowerCase();

  // Dedupe: an existing open lead from this email updates instead of piling up.
  const existing = (
    await db
      .select()
      .from(schema.leads)
      .where(
        and(
          eq(schema.leads.organizationId, studio.organizationId),
          eq(schema.leads.email, email),
          eq(schema.leads.status, "new"),
        ),
      )
      .limit(1)
  )[0];

  let leadId: string;
  if (existing) {
    leadId = existing.id;
    await db
      .update(schema.leads)
      .set({
        name: input.name,
        phone: input.phone || existing.phone,
        eventDate: input.eventDate ? new Date(`${input.eventDate}T12:00:00Z`) : existing.eventDate,
        eventType: input.eventType || existing.eventType,
        message: input.message || existing.message,
        embedOrigin: input.embedOrigin || existing.embedOrigin,
        updatedAt: new Date(),
      })
      .where(eq(schema.leads.id, existing.id));
  } else {
    leadId = crypto.randomUUID();
    await db.insert(schema.leads).values({
      id: leadId,
      organizationId: studio.organizationId,
      name: input.name,
      email,
      phone: input.phone || null,
      eventDate: input.eventDate ? new Date(`${input.eventDate}T12:00:00Z`) : null,
      eventType: input.eventType || null,
      message: input.message || null,
      source: "contact_form",
      embedOrigin: input.embedOrigin || null,
    });
  }

  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: studio.organizationId,
    actorType: "system",
    action: "lead.created",
    targetType: "lead",
    targetId: leadId,
    meta: JSON.stringify({ deduped: Boolean(existing) }),
  });

  // Notifications (async-ish: workerd keeps the ctx alive until the response
  // completes; failures never block the visitor's success).
  const lead = {
    name: input.name,
    email,
    phone: input.phone || null,
    eventType: input.eventType || null,
    eventDate: input.eventDate || null,
    message: input.message || null,
  };
  const accent = safeHexColor(studio.brand.accent) ?? "#5e6ad2";
  const profileRows = await db
    .select({ contactEmail: schema.studioProfiles.contactEmail })
    .from(schema.studioProfiles)
    .where(eq(schema.studioProfiles.organizationId, studio.organizationId))
    .limit(1);
  const studioInbox = profileRows[0]?.contactEmail;

  if (studioInbox) {
    const tmpl = inquiryReceivedEmail(studio.studioName, lead, `${url.origin}/dashboard/leads`, accent);
    await sendEmail({
      to: studioInbox,
      subject: tmpl.subject,
      html: tmpl.html,
      text: tmpl.text,
      replyTo: email,
      organizationId: studio.organizationId,
      template: "lead.inquiry_received",
      refId: leadId,
    });
  }
  const ack = inquiryAckEmail(studio.studioName, input.name.split(" ")[0] || "there", accent);
  await sendEmail({
    to: email,
    subject: ack.subject,
    html: ack.html,
    text: ack.text,
    organizationId: studio.organizationId,
    template: "lead.ack",
    refId: leadId,
  });

  return Response.json({ ok: true });
}

export async function GET() {
  return Response.json({ error: "method_not_allowed" }, { status: 405 });
}
