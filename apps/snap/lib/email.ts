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
  /** Override the From address (must be @snap.webcules.com, e.g. hello+{leadId}@). */
  fromOverride?: string;
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
  if (params.fromOverride) {
    // Accept "addr@domain" or "Display Name <addr@domain>" — validate the
    // address part only (the display format is what EMAIL.send expects).
    const addr = params.fromOverride.match(/<(.+)>/)?.[1] ?? params.fromOverride;
    if (!addr.endsWith("@snap.webcules.com")) {
      throw new Error("fromOverride must be on the snap.webcules.com domain");
    }
  }
  try {
    await env.EMAIL.send({
      to: params.to,
      from: params.fromOverride ?? env.EMAIL_FROM ?? "Snap <hello@snap.webcules.com>",
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

export function bookingConfirmedEmails(studioName: string, params: {
  clientName: string;
  startAt: Date;
  endAt: Date;
  tz: string;
  icsUrl: string;
  accent: string;
}) {
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: params.tz,
    weekday: "long", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(params.startAt);
  const button = (label: string) =>
    `<p style="margin:24px 0 0;"><a href="${params.icsUrl}" style="display:inline-block;background:${params.accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:8px;">${label}</a></p>`;
  const whenBlock = `<p style="margin:0 0 16px;padding:12px 16px;background:#f7f8f8;border-radius:8px;"><strong style="color:#0f1011;">${when}</strong> <span style="color:#8a8f98;">(${params.tz})</span></p>`;

  const client = {
    subject: `Booking confirmed — ${studioName}`,
    html: shell(
      params.accent,
      "You're booked!",
      `<p style="margin:0 0 16px;">Hi ${params.clientName}, your session with <strong>${studioName}</strong> is confirmed for:</p>
       ${whenBlock}
       ${button("Add to calendar")}`,
      `Booked with ${studioName} via Snap.`,
    ),
    text: `Hi ${params.clientName}, your session with ${studioName} is confirmed for ${when} (${params.tz}). Add to calendar: ${params.icsUrl}`,
  };
  const studio = {
    subject: `New booking — ${params.clientName} · ${when}`,
    html: shell(
      params.accent,
      "New booking confirmed",
      `<p style="margin:0 0 16px;"><strong style="color:#0f1011;">${params.clientName}</strong> booked a session:</p>
       ${whenBlock}
       ${button("Add to calendar")}`,
      "A project was created for this booking — see Projects.",
    ),
    text: `New booking: ${params.clientName}, ${when} (${params.tz}). Project created automatically. ICS: ${params.icsUrl}`,
  };
  return { client, studio };
}

export function bookingCanceledEmail(studioName: string, params: {
  clientName: string;
  startAt: Date;
  tz: string;
  accent: string;
}): { subject: string; html: string; text: string } {
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: params.tz, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(params.startAt);
  return {
    subject: `Booking canceled — ${studioName}`,
    html: shell(
      params.accent,
      "Booking canceled",
      `<p style="margin:0 0 12px;">Hi ${params.clientName}, your session with <strong style="color:#0f1011;">${studioName}</strong> scheduled for <strong style="color:#0f1011;">${when}</strong> has been canceled.</p>
       <p style="margin:0;">Questions? Just reply to this email.</p>`,
      `Sent by ${studioName} via Snap.`,
    ),
    text: `Hi ${params.clientName}, your session with ${studioName} on ${when} has been canceled.`,
  };
}

/** Usage warning (WEB-150) — 90% of plan storage / overage zone entry. */
export function usageWarningEmail(studioName: string, params: {
  usedLabel: string; capLabel: string; pct: number; planName: string; settingsUrl: string; accent: string;
}): { subject: string; html: string; text: string } {
  return {
    subject: `Storage at ${params.pct}% — ${studioName}`,
    html: shell(
      params.accent,
      "You're close to your storage cap",
      `<p style="margin:0 0 16px;">Your ${params.planName} plan storage is at <strong style="color:#0f1011;">${params.pct}%</strong> (${params.usedLabel} of ${params.capLabel}).</p>
       <p style="margin:0 0 16px;">Uploads keep working into the overage zone, but they lock at 2× your plan storage. Upgrading keeps everything smooth — and your files are never deleted.</p>
       <p style="margin:24px 0 0;"><a href="${params.settingsUrl}" style="display:inline-block;background:${params.accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:8px;">Review your plan</a></p>`,
      `Storage alert from your Snap ${params.planName} plan.`,
    ),
    text: `Your Snap ${params.planName} storage is at ${params.pct}% (${params.usedLabel} of ${params.capLabel}). Review your plan: ${params.settingsUrl}`,
  };
}

/** RAW Vault — month-5 renewal notice (WEB-153). */
export function rawRenewalEmail(studioName: string, params: {
  accent: string; vaultUrl: string; count: number; bytesLabel: string; projectNames: string[]; archiveOn: string;
}): { subject: string; html: string; text: string } {
  const projects = params.projectNames.slice(0, 6).join(", ") + (params.projectNames.length > 6 ? "…" : "");
  return {
    subject: `Your RAW files archive on ${params.archiveOn} — ${studioName}`,
    html: shell(
      params.accent,
      "RAW vault reminder",
      `<p style="margin:0 0 16px;"><strong style="color:#0f1011;">${params.count} RAW file${params.count === 1 ? "" : "s"} (${params.bytesLabel})</strong> from ${projects} move to low-cost cold storage on <strong style="color:#0f1011;">${params.archiveOn}</strong>.</p>
       <p style="margin:0 0 16px;">Nothing is deleted — cold files stay fully downloadable and can be restored to hot storage anytime. Restore now if you want them instantly available for the next 6 months.</p>
       <p style="margin:24px 0 0;"><a href="${params.vaultUrl}" style="display:inline-block;background:${params.accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:8px;">Keep RAWs hot for 6 more months</a></p>`,
      `Snap RAW vault policy: 6 months hot, then restorable cold storage. Raw files are only ever deleted after repeated emailed warnings.`,
    ),
    text: `${params.count} RAW files (${params.bytesLabel}) from ${projects} move to cold storage on ${params.archiveOn}. Nothing is deleted — restore anytime: ${params.vaultUrl}`,
  };
}

/** RAW Vault — archived confirmation (sent when the move happened). */
export function rawArchivedEmail(studioName: string, params: {
  accent: string; vaultUrl: string; count: number; bytesLabel: string; projectNames: string[]; deleteOn: string;
}): { subject: string; html: string; text: string } {
  const projects = params.projectNames.slice(0, 6).join(", ") + (params.projectNames.length > 6 ? "…" : "");
  return {
    subject: `${params.count} RAW file${params.count === 1 ? "" : "s"} archived (restorable) — ${studioName}`,
    html: shell(
      params.accent,
      "RAW files moved to cold storage",
      `<p style="margin:0 0 16px;"><strong style="color:#0f1011;">${params.count} RAW file${params.count === 1 ? "" : "s"} (${params.bytesLabel})</strong> from ${projects} are now in cold storage. They remain fully downloadable, and restoring them to hot storage takes one click.</p>
       <p style="margin:0 0 16px;">To keep the vault sustainable, files left in cold storage for 90 days are deleted — the earliest on <strong style="color:#0f1011;">${params.deleteOn}</strong>. You'll get two warnings first, and restoring or downloading always stops the clock.</p>
       <p style="margin:24px 0 0;"><a href="${params.vaultUrl}" style="display:inline-block;background:${params.accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:8px;">Open the RAW vault</a></p>`,
      `Snap RAW vault policy: 6 months hot, then restorable cold storage. Raw files are only ever deleted after repeated emailed warnings.`,
    ),
    text: `${params.count} RAW files (${params.bytesLabel}) from ${projects} moved to cold storage (restorable, still downloadable). Earliest deletion ${params.deleteOn} — two warnings come first. Vault: ${params.vaultUrl}`,
  };
}

/** RAW Vault — purge warnings (day 60 + final day 80 of the archive window). */
export function rawPurgeWarningEmail(studioName: string, params: {
  final: boolean; accent: string; vaultUrl: string; count: number; bytesLabel: string; projectNames: string[]; deleteOn: string;
}): { subject: string; html: string; text: string } {
  const projects = params.projectNames.slice(0, 6).join(", ") + (params.projectNames.length > 6 ? "…" : "");
  return {
    subject: params.final
      ? `Final notice: RAW files delete on ${params.deleteOn} — ${studioName}`
      : `RAW files will be deleted on ${params.deleteOn} — ${studioName}`,
    html: shell(
      params.accent,
      params.final ? "Final notice before deletion" : "Upcoming RAW deletion",
      `<p style="margin:0 0 16px;"><strong style="color:#0f1011;">${params.count} RAW file${params.count === 1 ? "" : "s"} (${params.bytesLabel})</strong> from ${projects} will be <strong style="color:#0f1011;">permanently deleted on ${params.deleteOn}</strong>${params.final ? " — this is the final notice." : "."}</p>
       <p style="margin:0 0 16px;">Download them or restore them to hot storage before then to keep them forever. Restoring pauses every deletion timer.</p>
       <p style="margin:24px 0 0;"><a href="${params.vaultUrl}" style="display:inline-block;background:${params.accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:8px;">Download or keep these files</a></p>`,
      `Snap never deletes without repeated emailed warnings — this is part of the RAW vault policy.`,
    ),
    text: `${params.count} RAW files (${params.bytesLabel}) from ${projects} are scheduled for permanent deletion on ${params.deleteOn}.${params.final ? " FINAL NOTICE." : ""} Download or restore before then: ${params.vaultUrl}`,
  };
}

/** Dormancy & retention notices (WEB-159) — four staged variants. */
export function dormancyEmail(studioName: string, params: {
  variant: "pre_ia" | "ia_moved" | "pre_purge" | "final_purge";
  accent: string;
  dashboardUrl: string;
  bytesLabel: string;
  deleteOn: string | null;
  free: boolean;
}): { subject: string; html: string; text: string } {
  const copy = {
    pre_ia: {
      subject: `Your Snap files move to cold storage soon — ${studioName}`,
      title: "Your studio has been quiet",
      body: `<p style="margin:0 0 16px;">It's been a while since anyone from <strong style="color:#0f1011;">${studioName}</strong> signed in. In about 10 days, your files (${params.bytesLabel}) move to low-cost cold storage to keep your plan sustainable.</p>
             <p style="margin:0 0 16px;">Nothing is deleted and everything stays downloadable — signing in is enough to stop any further changes.</p>`,
      cta: "Sign in to keep everything standard",
    },
    ia_moved: {
      subject: `Your files are now in cold storage (restorable) — ${studioName}`,
      title: "Files moved to cold storage",
      body: `<p style="margin:0 0 16px;">Your Snap files (${params.bytesLabel}) are now in low-cost cold storage. They remain fully functional — galleries, downloads, everything. You can move them back to standard storage with one click whenever you return.</p>`,
      cta: "Open Snap",
    },
    pre_purge: {
      subject: `Action needed: files delete on ${params.deleteOn ?? "soon"} — ${studioName}`,
      title: "Your Snap files are scheduled for deletion",
      body: `<p style="margin:0 0 16px;"><strong style="color:#0f1011;">${studioName}</strong> has been dormant for a long time. On <strong style="color:#0f1011;">${params.deleteOn ?? "the scheduled date"}</strong>, all stored files (${params.bytesLabel}) will be permanently deleted.</p>
             <p style="margin:0 0 16px;">Signing in stops it immediately and keeps everything safe. You'll get one more reminder before anything happens.</p>`,
      cta: "Sign in to keep your files",
    },
    final_purge: {
      subject: `Final notice: files delete on ${params.deleteOn ?? "soon"} — ${studioName}`,
      title: "Final notice before deletion",
      body: `<p style="margin:0 0 16px;">This is the last reminder: on <strong style="color:#0f1011;">${params.deleteOn ?? "the scheduled date"}</strong>, all files stored under <strong style="color:#0f1011;">${studioName}</strong> (${params.bytesLabel}) will be permanently deleted.</p>
             <p style="margin:0 0 16px;">Signing in once cancels the deletion. After the date, recovery is impossible.</p>`,
      cta: "Sign in now to keep your files",
    },
  }[params.variant];
  return {
    subject: copy.subject,
    html: shell(
      params.accent,
      copy.title,
      `${copy.body}
       <p style="margin:24px 0 0;"><a href="${params.dashboardUrl}" style="display:inline-block;background:${params.accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:8px;">${copy.cta}</a></p>`,
      `Snap retention policy: dormant studios move to low-cost storage before any deletion, and signing in always stops the process.`,
    ),
    text: `${copy.title}. ${studioName}: ${params.bytesLabel} stored. ${params.deleteOn ? `Deletion scheduled ${params.deleteOn}. ` : ""}Sign in: ${params.dashboardUrl}`,
  };
}

/** Founder margin alert (WEB-161) — threshold trip digest, max 1/day. */
export function marginAlertEmail(lines: string[], params: {
  month: string;
  reportUrl: string;
}): { subject: string; html: string; text: string } {
  const items = lines.map((l) => `<li style="margin:0 0 6px;">${l}</li>`).join("");
  return {
    subject: `Snap margin alert — ${lines.length} threshold${lines.length === 1 ? "" : "s"} tripped (${params.month})`,
    html: shell(
      "#d97706",
      "Margin thresholds tripped",
      `<p style="margin:0 0 12px;">Usage snapshot for <strong style="color:#0f1011;">${params.month}</strong> crossed alert thresholds:</p>
       <ul style="margin:0 0 16px;padding-left:20px;font-size:14px;">${items}</ul>
       <p style="margin:0;font-size:13px;color:#8a8f98;">Daily digest — you'll only hear about this again tomorrow if it persists.</p>`,
      `Snap platform monitoring (WEB-161): org COGS > 50% of plan price, or account email > 50% of the 3k/mo allowance.`,
    ),
    text: `Snap margin alerts (${params.month}):\n${lines.map((l) => `- ${l}`).join("\n")}`,
  };
}

/** Gallery OTP — big friendly code, short-lived. */
export function galleryOtpEmail(studioName: string, params: {
  code: string;
  galleryUrl: string;
  accent: string;
}): { subject: string; html: string; text: string } {
  return {
    subject: `Your verification code — ${studioName} gallery`,
    html: shell(
      params.accent,
      "Verify it's you",
      `<p style="margin:0 0 16px;">Enter this code to open your gallery from <strong style="color:#0f1011;">${studioName}</strong>:</p>
       <p style="margin:0 0 16px;padding:16px;background:#f7f8f8;border-radius:8px;text-align:center;font-size:30px;letter-spacing:8px;font-weight:600;color:#0f1011;">${params.code}</p>
       <p style="margin:0;font-size:13px;color:#8a8f98;">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>`,
      `Verification code for your ${studioName} gallery, sent via Snap.`,
    ),
    text: `Your verification code for the ${studioName} gallery: ${params.code}\n\nIt expires in 10 minutes.`,
  };
}

/** Gallery link — branded "your photos are ready" with expiry info. */
export function galleryLinkEmail(studioName: string, params: {
  clientName: string;
  galleryUrl: string;
  photoCount: number;
  expiresAt: Date | null;
  accent: string;
  fresh?: boolean; // false = re-send of an existing link
}): { subject: string; html: string; text: string } {
  const expires = params.expiresAt
    ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(params.expiresAt)
    : null;
  const expiryNote = expires
    ? `<p style="margin:16px 0 0;font-size:13px;color:#8a8f98;">This link stops working on <strong style="color:#3f4149;">${expires}</strong> — make sure to save your favorites before then.</p>`
    : "";
  const title = params.fresh === false ? "Your gallery link" : "Your photos are ready";
  const intro =
    params.fresh === false
      ? `<p style="margin:0 0 16px;">Hi ${params.clientName}, here's your gallery link from <strong style="color:#0f1011;">${studioName}</strong> once again.</p>`
      : `<p style="margin:0 0 16px;">Hi ${params.clientName}, <strong style="color:#0f1011;">${studioName}</strong> has shared ${params.photoCount} photo${params.photoCount === 1 ? "" : "s"} with you.</p>`;
  return {
    subject: `${params.fresh === false ? "Your gallery link" : "Your photos are ready"} — ${studioName}`,
    html: shell(
      params.accent,
      title,
      `${intro}
       <p style="margin:24px 0 0;"><a href="${params.galleryUrl}" style="display:inline-block;background:${params.accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:8px;">View gallery</a></p>
       <p style="margin:16px 0 0;font-size:12px;color:#8a8f98;">Or paste this link into your browser:<br><a href="${params.galleryUrl}" style="color:${params.accent};word-break:break-all;">${params.galleryUrl}</a></p>
       ${expiryNote}`,
      `Gallery from ${studioName}, delivered via Snap.`,
    ),
    text: `Hi ${params.clientName}, ${studioName} shared ${params.photoCount} photo${params.photoCount === 1 ? "" : "s"} with you. View gallery: ${params.galleryUrl}${expires ? `\n\nThis link expires ${expires}.` : ""}`,
  };
}
