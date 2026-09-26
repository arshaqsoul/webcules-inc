/* Inbound email webhook — consumed by the `webcules-snap-email` worker
 * (postal-mime parsed payloads). Bearer-authed with the shared
 * SNAP_INBOUND_WEBHOOK_SECRET set on both workers. Matched replies thread
 * into the lead AND notify the studio's inbox so nothing is missed. */
import { env } from "cloudflare:workers";

import { sendEmail } from "@/lib/email";
import { safeHexColor } from "@/lib/embed";
import { ingestInboundEmail } from "@/lib/repos/leads";
import { getStudioProfile } from "@/lib/repos/studios";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const expected = env.SNAP_INBOUND_WEBHOOK_SECRET;
  const auth = req.headers.get("Authorization") ?? "";
  if (!expected || auth !== `Bearer ${expected}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: {
    from?: string;
    to?: string;
    subject?: string;
    text?: string | null;
    html?: string | null;
    messageId?: string | null;
  };
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!payload.from || !payload.subject) {
    return Response.json({ error: "invalid_payload" }, { status: 400 });
  }

  const result = await ingestInboundEmail({
    from: payload.from,
    to: payload.to ?? "",
    subject: payload.subject.slice(0, 300),
    text: payload.text ?? null,
    html: payload.html ?? null,
    messageId: payload.messageId ?? null,
  });

  // Studio notification — the thread lives in Snap; this pings the inbox.
  if (result.matched && result.organizationId) {
    try {
      const profile = await getStudioProfile(result.organizationId);
      if (profile?.contactEmail) {
        const accent = safeHexColor(JSON.parse(profile.brand || "{}").accent) ?? "#5e6ad2";
        const senderName = payload.from.split("@")[0];
        const excerpt = (payload.text ?? "").slice(0, 240);
        const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
        const dashboardUrl = `https://snap.webcules.com/dashboard/leads/${result.leadId}`;
        await sendEmail({
          to: profile.contactEmail,
          subject: `💬 ${senderName} replied — view in Snap`,
          html: `<!doctype html><html><body style="margin:0;padding:0;background:#f7f8f8;font-family:Inter,-apple-system,system-ui,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8f8;padding:32px 16px;"><tr><td align="center">
    <table role="presentation" style="max-width:480px;background:#fff;border:1px solid #e3e5e8;border-radius:12px;padding:28px 32px;" cellpadding="0" cellspacing="0">
      <tr><td><span style="font-size:12px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${accent};">${esc(profile.studioName)} · SNAP</span></td></tr>
      <tr><td style="padding-top:12px;"><p style="margin:0;font-size:15px;color:#0f1011;"><strong>${esc(payload.from)}</strong> replied to your conversation:</p></td></tr>
      <tr><td style="padding-top:12px;"><p style="margin:0;padding:12px 16px;background:#f7f8f8;border-radius:8px;font-size:14px;color:#3f4149;white-space:pre-wrap;">${esc(excerpt || "(see the full message in Snap)")}</p></td></tr>
      <tr><td style="padding-top:20px;"><a href="${dashboardUrl}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:8px;">Reply in Snap</a></td></tr>
    </table>
  </td></tr></table></body></html>`,
          text: `${payload.from} replied: ${excerpt}\n\nReply in Snap: ${dashboardUrl}`,
          organizationId: result.organizationId,
          template: "lead.inbound_reply_notify",
          refId: result.leadId ?? null,
        });
      }
    } catch (err) {
      console.error("inbound notification failed:", String(err));
    }
  }

  return Response.json({ ok: true, ...result });
}
