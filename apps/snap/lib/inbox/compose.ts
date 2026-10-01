/* Inbox composer helpers (WEB-305) — the branded reply shell + business
 * signature (WEB-277). Shared shape with the lead-reply email so clients
 * see one consistent voice from the studio address. */
import { parseBusiness, type BusinessIdentity } from "@/lib/business";
import { getStudioProfile } from "@/lib/repos/studios";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Signature lines from the business identity bag — studio name plus
 * whatever of address/phone/website the studio has filled in. Empty string
 * when only the name is known (no fabricated contact details). */
export function businessSignature(businessJson: string | null, studioName: string): string {
  const b: BusinessIdentity = parseBusiness(businessJson, studioName);
  const lines = [b.legalName || studioName];
  const addr = b.addressLines.map((l) => l.trim()).filter(Boolean).join(", ");
  if (addr) lines.push(addr);
  if (b.phone) lines.push(b.phone);
  if (b.website) lines.push(b.website);
  return lines.slice(0, 4).join("\n");
}

export async function studioSignature(organizationId: string): Promise<string> {
  const profile = await getStudioProfile(organizationId);
  return businessSignature(profile?.business ?? null, profile?.studioName ?? "");
}

/** The branded reply email (HTML + text twins) sent from the studio address. */
export function buildReplyEmail(params: {
  studioName: string;
  accent: string;
  firstName: string;
  body: string;
  signature: string;
}): { html: string; text: string } {
  const { studioName, accent, firstName, body, signature } = params;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f7f8f8;font-family:Inter,-apple-system,system-ui,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8f8;padding:40px 16px;"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e3e5e8;border-radius:12px;padding:40px 32px;">
    <tr><td style="padding-bottom:8px;"><span style="font-size:13px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:${accent};">${esc(studioName)}</span></td></tr>
    <tr><td style="padding-bottom:24px;"><h1 style="margin:0;font-size:20px;line-height:1.3;font-weight:600;color:#0f1011;">Hi ${esc(firstName)},</h1></td></tr>
    <tr><td style="font-size:15px;line-height:1.7;color:#3f4149;white-space:pre-wrap;">${esc(body)}</td></tr>
    ${signature ? `<tr><td style="padding-top:24px;font-size:13px;line-height:1.6;color:#8a8f98;white-space:pre-wrap;">${esc(signature)}</td></tr>` : ""}
    <tr><td style="padding-top:32px;border-top:1px solid #e3e5e8;"><p style="margin:0;font-size:12px;line-height:1.5;color:#8a8f98;">Just reply to this email — ${esc(studioName)} sees your message instantly.</p></td></tr>
  </table>
</td></tr></table></body></html>`;
  const text = [`Hi ${firstName},`, "", body, signature ? `\n${signature}` : "", `\n— ${studioName}`].join("\n");
  return { html, text };
}
