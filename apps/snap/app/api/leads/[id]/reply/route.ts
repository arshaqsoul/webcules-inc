/* Reply to a lead — sends via Email Service (From: hello@snap.webcules.com,
 * Reply-To: the studio's inquiry inbox so the client's answer lands with the
 * photographer), records the outbound message, flips the lead to replied. */
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { sendEmail } from "@/lib/email";
import { safeHexColor } from "@/lib/embed";
import { getStudioProfile, getStudioSlug } from "@/lib/repos/studios";
import { recordOutboundReply } from "@/lib/repos/leads";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  body: z.string().trim().min(1).max(8000),
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

  const db = getDb();
  const lead = (
    await db
      .select()
      .from(schema.leads)
      .where(and(eq(schema.leads.id, id), eq(schema.leads.organizationId, ctx.organizationId)))
      .limit(1)
  )[0];
  if (!lead) return Response.json({ error: "not_found" }, { status: 404 });

  const profile = await getStudioProfile(ctx.organizationId);
  const studioName = profile?.studioName ?? ctx.user.name;
  const accent = safeHexColor(profile?.brand ? JSON.parse(profile.brand).accent : null) ?? "#5e6ad2";
  const firstName = lead.name.split(" ")[0] || "there";
  const subject = `Re: Your inquiry to ${studioName}`;
  // Studio-slug sub-address: client replies land on snap.webcules.com, route
  // through the email worker, and thread into the sender's lead (no Reply-To
  // diversion into the studio's private inbox). Display name keeps clients
  // seeing the studio, not the address.
  const slug = (await getStudioSlug(ctx.organizationId)) || "studio";
  const fromAddress = `${studioName} <hello+${slug}@snap.webcules.com>`;

  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f7f8f8;font-family:Inter,-apple-system,system-ui,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8f8;padding:40px 16px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e3e5e8;border-radius:12px;padding:40px 32px;">
      <tr><td style="padding-bottom:8px;"><span style="font-size:13px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:${accent};">${esc(studioName)}</span></td></tr>
      <tr><td style="padding-bottom:24px;"><h1 style="margin:0;font-size:20px;line-height:1.3;font-weight:600;color:#0f1011;">Hi ${esc(firstName)},</h1></td></tr>
      <tr><td style="font-size:15px;line-height:1.7;color:#3f4149;white-space:pre-wrap;">${esc(parsed.data.body)}</td></tr>
      <tr><td style="padding-top:32px;border-top:1px solid #e3e5e8;"><p style="margin:0;font-size:12px;line-height:1.5;color:#8a8f98;">Just reply to this email — ${esc(studioName)} sees your message instantly.</p></td></tr>
    </table>
  </td></tr></table></body></html>`;

  const sent = await sendEmail({
    to: lead.email,
    subject,
    html,
    text: `Hi ${firstName},\n\n${parsed.data.body}\n\n— ${studioName}`,
    organizationId: ctx.organizationId,
    template: "lead.reply",
    refId: lead.id,
    fromOverride: fromAddress,
  });

  await recordOutboundReply({
    organizationId: ctx.organizationId,
    leadId: lead.id,
    fromUserId: ctx.user.id,
    subject,
    body: parsed.data.body,
    providerId: null,
  });

  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: ctx.organizationId,
    actorType: "user",
    actorId: ctx.user.id,
    action: "lead.replied",
    targetType: "lead",
    targetId: lead.id,
    meta: JSON.stringify({ delivered: sent }),
  });

  return Response.json({ ok: true, delivered: sent });
}
