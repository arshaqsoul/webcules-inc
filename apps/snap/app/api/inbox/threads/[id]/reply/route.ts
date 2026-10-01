/* Inbox reply (WEB-305) — sends from the studio's own address
 * (hello+{slug}@snap.webcules.com, display name = the studio, WEB-240
 * white-label rules), records the outbound message on the thread (and the
 * lead, when the conversation began as an inquiry), optional dual-delivery
 * mirror copy to the studio's contact inbox. Merge fields resolve
 * server-side against the thread's client; failures record status=failed so
 * the composer can offer retry (nothing silently vanishes).
 * No outbound attachments in v1 (Email Workers 5 MiB cap) — the composer
 * inserts {{gallery_link}} instead. */
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";
import { getThreadWithMessages, appendThreadMessage, resolveOrCreateThread } from "@/lib/repos/inbox";
import { recordOutboundReply } from "@/lib/repos/leads";
import { getStudioProfile, getStudioSlug } from "@/lib/repos/studios";
import { getEmailBrand } from "@/lib/branding";
import { sendEmail } from "@/lib/email";
import { renderMergeFrom } from "@/lib/merge";
import { buildReplyEmail, studioSignature } from "@/lib/inbox/compose";
import { safeHexColor } from "@/lib/embed";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  body: z.string().trim().min(1).max(8000),
  /** Dual-delivery mirror: also drop a copy in the studio's real inbox. */
  mirrorCopy: z.boolean().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  const data = await getThreadWithMessages(ctx.organizationId, id);
  if (!data) return Response.json({ error: "not_found" }, { status: 404 });
  const { thread } = data;

  const profile = await getStudioProfile(ctx.organizationId);
  if (!profile) return Response.json({ error: "no_studio" }, { status: 404 });
  const brand = await getEmailBrand(ctx.organizationId);

  // Merge fields resolve against THIS client before composing.
  const resolved = await renderMergeFrom(
    { organizationId: ctx.organizationId, clientEmail: thread.clientEmail, projectId: thread.projectId ?? null },
    parsed.data.body,
    { surface: "plain" },
  );

  const clientName = await threadClientName(ctx.organizationId, thread.clientEmail, thread.leadId);
  const subject = thread.subject
    ? /^(re:\s*)/i.test(thread.subject)
      ? thread.subject
      : `Re: ${thread.subject}`
    : `Re: Your inquiry to ${brand.studioName}`;
  const slug = (await getStudioSlug(ctx.organizationId)) || "studio";
  const fromAddress = brand.whiteLabel
    ? `hello+${slug}@snap.webcules.com`
    : `${brand.studioName} <hello+${slug}@snap.webcules.com>`;
  const signature = await studioSignature(ctx.organizationId);
  const tmpl = buildReplyEmail({
    studioName: brand.studioName,
    accent: safeHexColor(brand.accent) ?? "#5e6ad2",
    firstName: clientName.split(" ")[0] || "there",
    body: resolved,
    signature,
  });

  const sent = await sendEmail({
    to: thread.clientEmail,
    subject,
    html: tmpl.html,
    text: tmpl.text,
    ...(brand.whiteLabel ? { fromName: brand.studioName } : {}),
    fromOverride: fromAddress,
    replyTo: profile.contactEmail ?? undefined,
    organizationId: ctx.organizationId,
    template: "inbox.reply",
    refId: thread.id,
  });

  // Mirror copy (dual delivery during the trust period): the studio's own
  // inbox keeps a searchable record while Snap's inbox proves itself.
  let mirrorSent = false;
  if (parsed.data.mirrorCopy && profile.contactEmail) {
    mirrorSent = await sendEmail({
      to: profile.contactEmail,
      subject: `Copy of your reply to ${clientName}`,
      html: tmpl.html,
      text: tmpl.text,
      organizationId: ctx.organizationId,
      template: "inbox.reply_mirror",
      refId: thread.id,
    });
  }

  // Conversation record: lead-linked threads reuse the lead flow (message +
  // status flip + thread append); project threads append directly.
  if (thread.leadId) {
    await recordOutboundReply({
      organizationId: ctx.organizationId,
      leadId: thread.leadId,
      fromUserId: ctx.user.id,
      subject,
      body: resolved,
      delivered: sent,
    });
  } else {
    const threadId = await resolveOrCreateThread({
      organizationId: ctx.organizationId,
      clientEmail: thread.clientEmail,
      subject: thread.subject,
      projectId: thread.projectId ?? null,
    });
    await appendThreadMessage({
      organizationId: ctx.organizationId,
      threadId,
      direction: "out",
      subject,
      textPreview: resolved,
      status: sent ? "sent" : "failed",
    });
  }

  await getDb().insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: ctx.organizationId,
    actorType: "user",
    actorId: ctx.user.id,
    action: "inbox.replied",
    targetType: "thread",
    targetId: thread.id,
    meta: JSON.stringify({ delivered: sent, mirrorSent, to: thread.clientEmail }),
  });

  return Response.json({ ok: true, delivered: sent, mirrorSent });
}

async function threadClientName(organizationId: string, email: string, leadId: string | null): Promise<string> {
  const db = getDb();
  const client = (
    await db
      .select({ name: schema.clients.name })
      .from(schema.clients)
      .where(and(eq(schema.clients.organizationId, organizationId), eq(schema.clients.email, email)))
      .limit(1)
  )[0];
  if (client?.name) return client.name;
  if (leadId) {
    const lead = (
      await db.select({ name: schema.leads.name }).from(schema.leads).where(eq(schema.leads.id, leadId)).limit(1)
    )[0];
    if (lead?.name) return lead.name;
  }
  return email;
}
