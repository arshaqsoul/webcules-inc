/* Transactional email via the Cloudflare Email Service `send_email` binding.
 * Every send logs to email_log. Branded per studio (accent + name); the auth
 * OTP template lives in auth.server.ts. */
import { env } from "cloudflare:workers";

import { getDb } from "./db";
import * as schema from "./db-schema";

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  organizationId?: string | null;
  template: string;
  refId?: string | null;
}): Promise<boolean> {
  if (!env.EMAIL) {
    console.log(
      `[email:dev-delivery] EMAIL binding unavailable — not sending.\n[email:dev-delivery] to=${params.to} subject=${params.subject}`,
    );
    return false;
  }
  try {
    await env.EMAIL.send({
      to: params.to,
      from: env.EMAIL_FROM || "Snap <hello@snap.webcules.com>",
      subject: params.subject,
      html: params.html,
      text: params.text,
      ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    } as Parameters<typeof env.EMAIL.send>[0]);
  } catch (err) {
    console.error(`email send failed (${params.template} → ${params.to}):`, String(err));
    try {
      const db = getDb();
      await db.insert(schema.emailLog).values({
        id: crypto.randomUUID(),
        organizationId: params.organizationId ?? null,
        toEmail: params.to,
        template: params.template,
        refId: params.refId ?? null,
        status: "failed",
      });
    } catch { /* logging must never throw */ }
    return false;
  }

  try {
    const db = getDb();
    await db.insert(schema.emailLog).values({
      id: crypto.randomUUID(),
      organizationId: params.organizationId ?? null,
      toEmail: params.to,
      template: params.template,
      refId: params.refId ?? null,
      status: "sent",
    });
  } catch (err) {
    console.error("email_log insert failed:", String(err));
  }
  return true;
}

function shell(accent: string, title: string, bodyHtml: string, footer: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f7f8f8;font-family:Inter,-apple-system,system-ui,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8f8;padding:40px 16px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e3e5e8;border-radius:12px;padding:40px 32px;">
      <tr><td style="padding-bottom:8px;"><span style="font-size:13px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:${accent};">Snap</span></td></tr>
      <tr><td style="padding-bottom:24px;"><h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:600;color:#0f1011;">${title}</h1></td></tr>
      <tr><td style="font-size:15px;line-height:1.6;color:#3f4149;">${bodyHtml}</tr>
      <tr><td style="padding-top:32px;border-top:1px solid #e3e5e8;"><p style="margin:0;font-size:12px;line-height:1.5;color:#8a8f98;">${footer}</p></td></tr>
    </table>
    <p style="margin:16px 0 0;font-size:12px;color:#8a8f98;">snap.webcules.com</p>
  </td></tr></table></body></html>`;
}

function row(label: string, value: string): string {
  return value ? `<tr><td style="padding:4px 12px 4px 0;color:#8a8f98;font-size:13px;vertical-align:top;white-space:nowrap;">${label}</td><td style="padding:4px 0;color:#0f1011;font-size:13px;">${value}</td></tr>` : "";
}

export function inquiryReceivedEmail(studioName: string, lead: {
  name: string; email: string; phone?: string | null; eventType?: string | null;
  eventDate?: string | null; message?: string | null;
}, dashboardUrl: string, accent: string) {
  const details = `<table cellpadding="0" cellspacing="0">${[
    row("Name", lead.name),
    row("Email", `<a href="mailto:${lead.email}" style="color:${accent};">${lead.email}</a>`),
    row("Phone", lead.phone ?? ""),
    row("Shoot type", lead.eventType ?? ""),
    row("Event date", lead.eventDate ?? ""),
  ].join("")}</table>`;
  return {
    subject: `New inquiry — ${lead.name}${lead.eventType ? ` (${lead.eventType})` : ""}`,
    html: shell(
      accent,
      "You have a new inquiry",
      `${details}
       ${lead.message ? `<p style="margin:16px 0 0;padding:12px 16px;background:#f7f8f8;border-radius:8px;color:#3f4149;">${lead.message}</p>` : ""}
       <p style="margin:24px 0 0;"><a href="${dashboardUrl}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:8px;">Open in Snap</a></p>`,
      "You received this because a visitor submitted your Snap contact form.",
    ),
    text: `New inquiry from ${lead.name} <${lead.email}>${lead.phone ? ` · ${lead.phone}` : ""}${lead.eventType ? ` · ${lead.eventType}` : ""}${lead.eventDate ? ` · ${lead.eventDate}` : ""}\n\n${lead.message ?? ""}\n\nOpen in Snap: ${dashboardUrl}`,
  };
}

export function inquiryAckEmail(studioName: string, leadName: string, accent: string) {
  return {
    subject: `We got your inquiry — ${studioName}`,
    html: shell(
      accent,
      `Thanks, ${leadName}!`,
      `<p style="margin:0 0 16px;">Your inquiry to <strong>${studioName}</strong> is in. They typically reply within a day — keep an eye on your inbox.</p>
       <p style="margin:0;">If you didn't expect this email, you can safely ignore it.</p>`,
      `Sent by ${studioName} via Snap.`,
    ),
    text: `Thanks, ${leadName}! Your inquiry to ${studioName} is in. They typically reply within a day.`,
  };
}
