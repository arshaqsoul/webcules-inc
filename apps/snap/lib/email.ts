/* Transactional email via the Cloudflare Email Service `send_email` binding.
 * Every send logs to email_log. Branded per studio (accent + name); the auth
 * OTP template lives in auth.server.ts.
 *
 * WEB-237/238 white-label split — CLIENT templates drop every Snap mention
 * when the org is white-labeled (shell wordmark, "via Snap" footers, portal
 * copy); INTERNAL templates keep Snap identity:
 *   client: inquiryAckEmail, bookingConfirmedEmails(.client),
 *           bookingCanceledEmail, refundClientEmail,
 *           bookingConfirmedClientEmail, projectCompleteClientEmail,
 *           invoiceEmail, contractSignRequestEmail, contractSignedEmail,
 *           galleryOtpEmail, galleryLinkEmail
 *   internal (Snap stays): inquiryReceivedEmail, usageWarningEmail,
 *           rawRenewalEmail, rawArchivedEmail, rawPurgeWarningEmail,
 *           dormancyEmail, marginAlertEmail, domainDegraded/RecoveredEmail,
 *           bookingConfirmedEmails(.studio)
 *   cross-studio platform emails (no single org to attribute — honest limit,
 *   like the from-address): portalCodeEmail, portalStaffRedirectEmail */
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
  /** WEB-238: From display name for white-labeled studios — the address
   * stays on snap.webcules.com (signed domain), the visible name is the
   * studio's. Ignored when absent → default display unchanged. */
  fromName?: string;
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
  // WEB-253: studio copy overrides (subject + intro) for client-facing
  // templates. Merge fields resolve with studio + recipient context; the
  // shell (logo, buttons, footer) is never touched.
  let subject = params.subject;
  let html = params.html;
  let text = params.text;
  if (params.organizationId) {
    try {
      const { loadEmailOverrides, applyEmailOverride } = await import("./email-overrides");
      const { buildMergeValues } = await import("./merge");
      const override = (await loadEmailOverrides(params.organizationId))[params.template];
      if (override) {
        const values = await buildMergeValues({ organizationId: params.organizationId, clientEmail: params.to });
        const applied = applyEmailOverride({ subject, html, text }, override, values);
        subject = applied.subject;
        html = applied.html;
        text = applied.text;
      }
    } catch {
      /* overrides are cosmetic — never block a send */
    }
  }
  let from = params.fromOverride ?? env.EMAIL_FROM ?? "Snap <hello@snap.webcules.com>";
  if (params.fromName) {
    const addr = from.match(/<(.+)>/)?.[1] ?? from;
    from = `${params.fromName} <${addr}>`;
  }
  try {
    await env.EMAIL.send({
      to: params.to,
      from,
      subject,
      html,
      text,
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

/** WEB-238/240: white-label context for client templates — header (logo
 * image when the 2/8 email-header asset exists, studio-name wordmark
 * otherwise), the snap.webcules.com pre-footer line, and the footer
 * contact mailto flip; per-template footer copy stays with each template. */
export type EmailBrand = {
  studioName: string;
  whiteLabel: boolean;
  /** Absolute public URL of the generated email-header logo (nullable —
   * image-blocking clients and logo-less studios get the wordmark). */
  emailHeaderUrl?: string | null;
  /** Studio contact address appended to white-labeled footers (mailto). */
  contactEmail?: string | null;
};

/** WEB-253: exported for the preview renderer + same-function tests. */
export function shell(accent: string, title: string, bodyHtml: string, footer: string, brand?: EmailBrand): string {
  const headerHtml = brand?.whiteLabel
    ? brand.emailHeaderUrl
      ? `<img src="${brand.emailHeaderUrl}" alt="${brand.studioName}" height="40" style="height:40px;display:block;border:0;max-width:220px;object-fit:contain;" />`
      : `<span style="font-size:13px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:${accent};">${brand.studioName}</span>`
    : `<span style="font-size:13px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:${accent};">Snap</span>`;
  const footerHtml =
    brand?.whiteLabel && brand.contactEmail
      ? `${footer} · <a href="mailto:${brand.contactEmail}" style="color:#8a8f98;text-decoration:underline;">${brand.contactEmail}</a>`
      : footer;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f7f8f8;font-family:Inter,-apple-system,system-ui,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8f8;padding:40px 16px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e3e5e8;border-radius:12px;padding:40px 32px;">
      <tr><td style="padding-bottom:8px;">${headerHtml}</td></tr>
      <tr><td style="padding-bottom:24px;"><h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:600;color:#0f1011;">${title}</h1></td></tr>
      <tr><td style="font-size:15px;line-height:1.6;color:#3f4149;">${bodyHtml}</tr>
      <tr><td style="padding-top:32px;border-top:1px solid #e3e5e8;"><p style="margin:0;font-size:12px;line-height:1.5;color:#8a8f98;">${footerHtml}</p></td></tr>
    </table>
    ${brand?.whiteLabel ? "" : `<p style="margin:16px 0 0;font-size:12px;color:#8a8f98;">snap.webcules.com</p>`}
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

export function inquiryAckEmail(
  studioName: string,
  leadName: string,
  accent: string,
  whiteLabel = false,
  emailHeaderUrl?: string | null,
  contactEmail?: string | null,
) {
  return {
    subject: `We got your inquiry — ${studioName}`,
    html: shell(
      accent,
      `Thanks, ${leadName}!`,
      `<p style="margin:0 0 16px;">Your inquiry to <strong>${studioName}</strong> is in. They typically reply within a day — keep an eye on your inbox.</p>
       <p style="margin:0;">If you didn't expect this email, you can safely ignore it.</p>`,
      `Sent by ${studioName}${whiteLabel ? "." : " via Snap."}`,
      { studioName, whiteLabel, emailHeaderUrl, contactEmail },
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
  whiteLabel?: boolean;
  /** WEB-240: logo header + footer contact from the 2/8 asset bundle. */
  emailHeaderUrl?: string | null;
  contactEmail?: string | null;
}) {
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: params.tz,
    weekday: "long", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(params.startAt);
  const button = (label: string) =>
    `<p style="margin:24px 0 0;"><a href="${params.icsUrl}" style="display:inline-block;background:${params.accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:8px;">${label}</a></p>`;
  const whenBlock = `<p style="margin:0 0 16px;padding:12px 16px;background:#f7f8f8;border-radius:8px;"><strong style="color:#0f1011;">${when}</strong> <span style="color:#8a8f98;">(${params.tz})</span></p>`;
  const wl = params.whiteLabel === true;

  const client = {
    subject: `Booking confirmed — ${studioName}`,
    html: shell(
      params.accent,
      "You're booked!",
      `<p style="margin:0 0 16px;">Hi ${params.clientName}, your session with <strong>${studioName}</strong> is confirmed for:</p>
       ${whenBlock}
       ${button("Add to calendar")}`,
      `Booked with ${studioName}${wl ? "." : " via Snap."}`,
      { studioName, whiteLabel: wl, emailHeaderUrl: params.emailHeaderUrl, contactEmail: params.contactEmail },
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
  whiteLabel?: boolean;
  /** WEB-240: logo header + footer contact from the 2/8 asset bundle. */
  emailHeaderUrl?: string | null;
  contactEmail?: string | null;
}): { subject: string; html: string; text: string } {
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: params.tz, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(params.startAt);
  const wl = params.whiteLabel === true;
  return {
    subject: `Booking canceled — ${studioName}`,
    html: shell(
      params.accent,
      "Booking canceled",
      `<p style="margin:0 0 12px;">Hi ${params.clientName}, your session with <strong style="color:#0f1011;">${studioName}</strong> scheduled for <strong style="color:#0f1011;">${when}</strong> has been canceled.</p>
       <p style="margin:0;">Questions? Just reply to this email.</p>`,
      `Sent by ${studioName}${wl ? "." : " via Snap."}`,
      { studioName, whiteLabel: wl, emailHeaderUrl: params.emailHeaderUrl, contactEmail: params.contactEmail },
    ),
    text: `Hi ${params.clientName}, your session with ${studioName} on ${when} has been canceled.`,
  };
}

/** Refund confirmation (WEB-141) — sent when charge.refunded lands: states
 * what happens to the booking, the project, and its content. */
export function refundClientEmail(studioName: string, params: {
  clientName: string;
  startAt: Date | null;
  tz: string;
  accent: string;
  amountLabel: string;
  projectTitle: string | null;
  contentDeleted: boolean;
  whiteLabel?: boolean;
  /** WEB-240: logo header + footer contact from the 2/8 asset bundle. */
  emailHeaderUrl?: string | null;
  contactEmail?: string | null;
}): { subject: string; html: string; text: string } {
  const when = params.startAt
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: params.tz, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
      }).format(params.startAt)
    : null;
  const sessionLine = when ? ` for <strong style="color:#0f1011;">${when}</strong>` : "";
  const projectLine = params.projectTitle
    ? ` The project <strong style="color:#0f1011;">${params.projectTitle}</strong> has been canceled as well.`
    : " The project has been canceled as well.";
  const contentLine = params.contentDeleted
    ? " The uploaded photos from this project have been deleted."
    : " Any gallery links you received stay available until they expire.";
  const wl = params.whiteLabel === true;
  return {
    subject: `Refund processed — ${studioName}`,
    html: shell(
      params.accent,
      "Refund processed",
      `<p style="margin:0 0 12px;">Hi ${params.clientName}, a refund of <strong style="color:#0f1011;">${params.amountLabel}</strong> has been issued.</p>
       <p style="margin:0 0 12px;">Your session with <strong style="color:#0f1011;">${studioName}</strong>${sessionLine} has been canceled.${projectLine}${contentLine}</p>
       <p style="margin:0;">Refunds take 5–10 business days to appear on your statement. Questions? Just reply to this email.</p>`,
      `Sent by ${studioName}${wl ? "." : " via Snap."}`,
      { studioName, whiteLabel: wl, emailHeaderUrl: params.emailHeaderUrl, contactEmail: params.contactEmail },
    ),
    text: `Hi ${params.clientName}, a refund of ${params.amountLabel} has been issued. Your session with ${studioName}${when ? ` on ${when}` : ""} has been canceled.${params.projectTitle ? ` The project ${params.projectTitle} has been canceled as well.` : ""}${params.contentDeleted ? " The uploaded photos from this project have been deleted." : " Any gallery links you received stay available until they expire."} Refunds take 5-10 business days to appear on your statement.`,
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

/** Portal magic-code login (WEB-131) — cross-studio surface. WEB-240: when
 * EVERY studio this client works with is white-labeled (computed by the
 * caller from the client's org rows), the code email goes studio-neutral
 * with zero Snap mentions; otherwise platform-branded as today. No logo
 * header possible — no single org to attribute. */
export function portalCodeEmail(code: string, allWhiteLabeled = false): { subject: string; html: string; text: string } {
  if (allWhiteLabeled) {
    return {
      subject: "Your client portal code",
      html: shell(
        "#5e6ad2",
        "Sign in to your client portal",
        `<p style="margin:0 0 16px;">Enter this code to open your client portal:</p>
       <p style="margin:0 0 16px;padding:16px;background:#f7f8f8;border-radius:8px;text-align:center;font-size:30px;letter-spacing:8px;font-weight:600;color:#0f1011;">${code}</p>
       <p style="margin:0;font-size:13px;color:#8a8f98;">It expires in 10 minutes. If you didn't request it, you can ignore this email.</p>`,
        `One code signs you into every studio you work with.`,
        { studioName: "your studios", whiteLabel: true },
      ),
      text: `Your client portal code: ${code}\n\nIt expires in 10 minutes.`,
    };
  }
  return {
    subject: "Your Snap portal code",
    html: shell(
      "#5e6ad2",
      "Sign in to your client portal",
      `<p style="margin:0 0 16px;">Enter this code to open your Snap client portal:</p>
       <p style="margin:0 0 16px;padding:16px;background:#f7f8f8;border-radius:8px;text-align:center;font-size:30px;letter-spacing:8px;font-weight:600;color:#0f1011;">${code}</p>
       <p style="margin:0;font-size:13px;color:#8a8f98;">It expires in 10 minutes. If you didn't request it, you can ignore this email.</p>`,
      `One code signs you into every studio you work with on Snap.`,
    ),
    text: `Your Snap portal code: ${code}\n\nIt expires in 10 minutes.`,
  };
}

/** Portal login attempt with a staff email — point them at the dashboard. */
export function portalStaffRedirectEmail(dashboardUrl: string): { subject: string; html: string; text: string } {
  return {
    subject: "You already have a Snap studio account",
    html: shell(
      "#5e6ad2",
      "Use your studio login instead",
      `<p style="margin:0 0 16px;">This email is signed up as a Snap studio team member, so the client portal isn't the right door — your studios live in the dashboard.</p>
       <p style="margin:24px 0 0;"><a href="${dashboardUrl}" style="display:inline-block;background:#5e6ad2;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:8px;">Open the Snap dashboard</a></p>`,
      `Snap studio members sign in through the dashboard.`,
    ),
    text: `This email is a Snap studio team member — sign in through the dashboard: ${dashboardUrl}`,
  };
}

/** Booking confirmed (WEB-136) — payment landed, the slot is locked in. */
export function bookingConfirmedClientEmail(studioName: string, params: {
  accent: string;
  when: Date;
  portalUrl: string;
  whiteLabel?: boolean;
  /** WEB-240: logo header + footer contact from the 2/8 asset bundle. */
  emailHeaderUrl?: string | null;
  contactEmail?: string | null;
}): { subject: string; html: string; text: string } {
  const wl = params.whiteLabel === true;
  return {
    subject: `Your session is booked with ${studioName}`,
    html: shell(
      params.accent,
      "You're booked!",
      `<p style="margin:0 0 16px;"><strong style="color:#0f1011;">${studioName}</strong> has confirmed your session for <strong style="color:#0f1011;">${params.when.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</strong> at ${params.when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.</p>
       <p style="margin:0 0 16px;">Payment is confirmed — nothing more to do. You can follow your project any time from your ${wl ? "client portal" : "Snap portal"}.</p>
       <p style="margin:24px 0 0;"><a href="${params.portalUrl}" style="display:inline-block;background:${params.accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:8px;">Open your portal</a></p>`,
      wl
        ? `You can turn these emails off inside your client portal.`
        : `You can turn these emails off per studio inside your Snap portal.`,
      { studioName, whiteLabel: wl, emailHeaderUrl: params.emailHeaderUrl, contactEmail: params.contactEmail },
    ),
    text: `${studioName} confirmed your session for ${params.when.toLocaleString()}. Portal: ${params.portalUrl}`,
  };
}

/** Photos delivered — project marked complete (WEB-136). */
export function projectCompleteClientEmail(studioName: string, params: {
  accent: string;
  projectTitle: string;
  portalUrl: string;
  whiteLabel?: boolean;
  /** WEB-240: logo header + footer contact from the 2/8 asset bundle. */
  emailHeaderUrl?: string | null;
  contactEmail?: string | null;
}): { subject: string; html: string; text: string } {
  const wl = params.whiteLabel === true;
  return {
    subject: `Your photos from ${studioName} are ready`,
    html: shell(
      params.accent,
      "Your photos are ready 🎉",
      `<p style="margin:0 0 16px;">Your project <strong style="color:#0f1011;">${params.projectTitle}</strong> with <strong style="color:#0f1011;">${studioName}</strong> has been marked delivered.</p>
       <p style="margin:0 0 16px;">Any galleries they've shared with you are live now — open your portal to view and download.</p>
       <p style="margin:24px 0 0;"><a href="${params.portalUrl}" style="display:inline-block;background:${params.accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:8px;">View your photos</a></p>`,
      wl
        ? `You can turn these emails off inside your client portal.`
        : `You can turn these emails off per studio inside your Snap portal.`,
      { studioName, whiteLabel: wl, emailHeaderUrl: params.emailHeaderUrl, contactEmail: params.contactEmail },
    ),
    text: `${studioName} marked "${params.projectTitle}" as delivered. Portal: ${params.portalUrl}`,
  };
}

/** Invoice sent to a client (WEB-137) — secure link, branded. */
export function invoiceEmail(studioName: string, params: {
  accent: string;
  invoiceNumber: string;
  amountLabel: string;
  dueLabel: string | null;
  invoiceUrl: string;
  whiteLabel?: boolean;
  /** WEB-240: logo header + footer contact from the 2/8 asset bundle. */
  emailHeaderUrl?: string | null;
  contactEmail?: string | null;
}): { subject: string; html: string; text: string } {
  const wl = params.whiteLabel === true;
  return {
    subject: `Invoice ${params.invoiceNumber} from ${studioName}`,
    html: shell(
      params.accent,
      `Invoice ${params.invoiceNumber}`,
      `<p style="margin:0 0 16px;"><strong style="color:#0f1011;">${studioName}</strong> has sent you an invoice for <strong style="color:#0f1011;">${params.amountLabel}</strong>${params.dueLabel ? `, due ${params.dueLabel}` : ""}.</p>
       <p style="margin:0 0 16px;">Open the secure link to view the details and download the PDF.</p>
       <p style="margin:24px 0 0;"><a href="${params.invoiceUrl}" style="display:inline-block;background:${params.accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:8px;">View invoice</a></p>`,
      wl
        ? `Invoices open via secure links unique to you.`
        : `Invoices from Snap studios open via secure links unique to you.`,
      { studioName, whiteLabel: wl, emailHeaderUrl: params.emailHeaderUrl, contactEmail: params.contactEmail },
    ),
    text: `${studioName} sent invoice ${params.invoiceNumber} for ${params.amountLabel}${params.dueLabel ? ` (due ${params.dueLabel})` : ""}. View it: ${params.invoiceUrl}`,
  };
}

/** Contract signing request (WEB-158). */
export function contractSignRequestEmail(studioName: string, params: {
  accent: string;
  title: string;
  signUrl: string;
  whiteLabel?: boolean;
  /** WEB-240: logo header + footer contact from the 2/8 asset bundle. */
  emailHeaderUrl?: string | null;
  contactEmail?: string | null;
}): { subject: string; html: string; text: string } {
  const wl = params.whiteLabel === true;
  return {
    subject: `Please review & sign: ${params.title} — ${studioName}`,
    html: shell(
      params.accent,
      "A contract awaits your signature",
      `<p style="margin:0 0 16px;"><strong style="color:#0f1011;">${studioName}</strong> has sent you <strong style="color:#0f1011;">${params.title}</strong> for review and signature.</p>
       <p style="margin:0 0 16px;">Open the secure link to read the full contract and sign it — no account needed. Your signature records the date, time and IP address for both parties' records.</p>
       <p style="margin:24px 0 0;"><a href="${params.signUrl}" style="display:inline-block;background:${params.accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:8px;">Review & sign</a></p>`,
      wl
        ? `Contracts are signed electronically via secure links unique to you.`
        : `Snap contracts are signed electronically via secure links unique to you.`,
      { studioName, whiteLabel: wl, emailHeaderUrl: params.emailHeaderUrl, contactEmail: params.contactEmail },
    ),
    text: `${studioName} sent you "${params.title}" for signature. Review & sign: ${params.signUrl}`,
  };
}

/** Contract signed — sent to BOTH parties (WEB-158). */
export function contractSignedEmail(studioName: string, params: {
  accent: string;
  title: string;
  signerName: string;
  signedAt: Date;
  contractUrl: string;
  whiteLabel?: boolean;
  /** WEB-240: logo header + footer contact from the 2/8 asset bundle. */
  emailHeaderUrl?: string | null;
  contactEmail?: string | null;
}): { subject: string; html: string; text: string } {
  const wl = params.whiteLabel === true;
  return {
    subject: `Signed: ${params.title}`,
    html: shell(
      params.accent,
      "Contract signed ✓",
      `<p style="margin:0 0 16px;"><strong style="color:#0f1011;">${params.title}</strong> was signed by <strong style="color:#0f1011;">${params.signerName}</strong> on ${params.signedAt.toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })} UTC.</p>
       <p style="margin:0 0 16px;">The signed copy is archived — open the link any time to view or download the PDF.</p>
       <p style="margin:24px 0 0;"><a href="${params.contractUrl}" style="display:inline-block;background:${params.accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:8px;">View signed contract</a></p>`,
      wl
        ? `Electronically signed — date, time and IP recorded for both parties.`
        : `Electronically signed via Snap — date, time and IP recorded for both parties.`,
      { studioName, whiteLabel: wl, emailHeaderUrl: params.emailHeaderUrl, contactEmail: params.contactEmail },
    ),
    text: `"${params.title}" was signed by ${params.signerName} on ${params.signedAt.toISOString()}. View: ${params.contractUrl}`,
  };
}

/** Gallery OTP — big friendly code, short-lived. */
export function galleryOtpEmail(studioName: string, params: {
  code: string;
  galleryUrl: string;
  accent: string;
  whiteLabel?: boolean;
  /** WEB-240: logo header + footer contact from the 2/8 asset bundle. */
  emailHeaderUrl?: string | null;
  contactEmail?: string | null;
}): { subject: string; html: string; text: string } {
  const wl = params.whiteLabel === true;
  return {
    subject: `Your verification code — ${studioName} gallery`,
    html: shell(
      params.accent,
      "Verify it's you",
      `<p style="margin:0 0 16px;">Enter this code to open your gallery from <strong style="color:#0f1011;">${studioName}</strong>:</p>
       <p style="margin:0 0 16px;padding:16px;background:#f7f8f8;border-radius:8px;text-align:center;font-size:30px;letter-spacing:8px;font-weight:600;color:#0f1011;">${params.code}</p>
       <p style="margin:0;font-size:13px;color:#8a8f98;">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>`,
      wl
        ? `Verification code for your ${studioName} gallery.`
        : `Verification code for your ${studioName} gallery, sent via Snap.`,
      { studioName, whiteLabel: wl, emailHeaderUrl: params.emailHeaderUrl, contactEmail: params.contactEmail },
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
  whiteLabel?: boolean;
  /** WEB-240: logo header + footer contact from the 2/8 asset bundle. */
  emailHeaderUrl?: string | null;
  contactEmail?: string | null;
}): { subject: string; html: string; text: string } {
  const wl = params.whiteLabel === true;
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
      `Gallery from ${studioName}${wl ? "." : ", delivered via Snap."}`,
      { studioName, whiteLabel: wl, emailHeaderUrl: params.emailHeaderUrl, contactEmail: params.contactEmail },
    ),
    text: `Hi ${params.clientName}, ${studioName} shared ${params.photoCount} photo${params.photoCount === 1 ? "" : "s"} with you. View gallery: ${params.galleryUrl}${expires ? `\n\nThis link expires ${expires}.` : ""}`,
  };
}

/** WEB-230: a studio's custom domain stopped resolving at Snap — the email
 * carries the exact records to restore so the studio never has to hunt. */
export function domainDegradedEmail(studioName: string, params: {
  accent: string; hostname: string; cnameTarget: string; txtName: string; txtValue: string;
}): { subject: string; html: string; text: string } {
  return {
    subject: `Your gallery domain needs attention — ${params.hostname}`,
    html: shell(
      params.accent,
      `${params.hostname} needs attention`,
      `<p style="margin:0 0 16px;">Visitors may not be reaching your galleries on <strong style="color:#0f1011;">${params.hostname}</strong> right now. Restore these two DNS records at your domain host and it will reconnect automatically (usually within the hour):</p>
       <p style="margin:0 0 12px;padding:12px;background:#f7f8f8;border-radius:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.8;color:#0f1011;">CNAME&nbsp;&nbsp;${params.hostname}&nbsp;&nbsp;→&nbsp;&nbsp;${params.cnameTarget}<br>TXT&nbsp;&nbsp;${params.txtName}&nbsp;&nbsp;=&nbsp;&nbsp;"${params.txtValue}"</p>
       <p style="margin:0;font-size:13px;color:#8a8f98;">We'll keep checking and will email you when it's back.</p>`,
      `Domain alert from your Snap studio ${studioName}.`,
    ),
    text: `Your gallery domain ${params.hostname} needs attention — restore these DNS records at your host:\nCNAME ${params.hostname} -> ${params.cnameTarget}\nTXT ${params.txtName} = "${params.txtValue}"\nWe'll email you when it reconnects.`,
  };
}

/** WEB-230: recovery follow-up — only sent after a degraded email went out. */
export function domainRecoveredEmail(studioName: string, params: {
  accent: string; hostname: string;
}): { subject: string; html: string; text: string } {
  return {
    subject: `${params.hostname} is back online`,
    html: shell(
      params.accent,
      `${params.hostname} is back online`,
      `<p style="margin:0 0 16px;">Your galleries are reachable on <strong style="color:#0f1011;">${params.hostname}</strong> again. Nothing else to do.</p>`,
      `Domain recovery notice from your Snap studio ${studioName}.`,
    ),
    text: `Your gallery domain ${params.hostname} is back online.`,
  };
}

/* ---------------- Questionnaires (WEB-248) ---------------- */

export function questionnaireLinkEmail(studioName: string, params: {
  projectName: string;
  url: string;
  accent: string;
  whiteLabel?: boolean;
  emailHeaderUrl?: string | null;
  contactEmail?: string | null;
}) {
  return {
    subject: `A few questions about ${params.projectName} — ${studioName}`,
    html: shell(
      params.accent,
      `A few quick questions`,
      `<p style="margin:0 0 16px;"><strong>${studioName}</strong> shared a short questionnaire for <strong>${params.projectName}</strong> — your answers help them prepare and plan.</p>
       <p style="margin:24px 0;"><a href="${params.url}" style="display:inline-block;background:${params.accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:8px;">Open the questionnaire</a></p>
       <p style="margin:0;font-size:13px;color:#8a8f98;">The link is private to you — no account needed.</p>`,
      `Sent by ${studioName}${params.whiteLabel ? "." : " via Snap."}`,
      { studioName, whiteLabel: params.whiteLabel ?? false, emailHeaderUrl: params.emailHeaderUrl, contactEmail: params.contactEmail },
    ),
    text: `${studioName} shared a questionnaire for ${params.projectName} — open it here: ${params.url}`,
  };
}

export function questionnaireAckEmail(studioName: string, projectName: string, params: {
  accent: string;
  whiteLabel?: boolean;
  emailHeaderUrl?: string | null;
  contactEmail?: string | null;
}) {
  return {
    subject: `Got your answers — ${studioName}`,
    html: shell(
      params.accent,
      `Thank you!`,
      `<p style="margin:0 0 16px;">Your answers for <strong>${projectName}</strong> are safely with <strong>${studioName}</strong>. They will reach out if anything needs clarifying.</p>`,
      `Sent by ${studioName}${params.whiteLabel ? "." : " via Snap."}`,
      { studioName, whiteLabel: params.whiteLabel ?? false, emailHeaderUrl: params.emailHeaderUrl, contactEmail: params.contactEmail },
    ),
    text: `Thank you! Your answers for ${projectName} are with ${studioName}.`,
  };
}

export function questionnaireAnsweredEmail(studioName: string, projectName: string, answers: { answers: Record<string, string>; files: Record<string, { name: string; bytes: number }> }, schema: { fields: Array<{ id: string; label: string }> }, params: {
  accent: string;
  dashboardUrl: string;
}) {
  const labels = new Map(schema.fields.map((f) => [f.id, f.label]));
  const rows = [
    ...Object.entries(answers.answers)
      .filter(([, v]) => v && v !== "no")
      .map(([id, v]) => row(labels.get(id) ?? id, v === "yes" ? "Yes" : v)),
    ...Object.entries(answers.files).map(([id, f]) => row(labels.get(id) ?? "File", `${f.name} (${Math.round(f.bytes / 1024)} KB)`)),
  ].join("");
  return {
    subject: `Questionnaire answered — ${projectName}`,
    html: shell(
      params.accent,
      `Questionnaire answered`,
      `<p style="margin:0 0 16px;">The client just submitted their answers for <strong>${projectName}</strong>.</p>
       <table cellpadding="0" cellspacing="0">${rows}</table>
       <p style="margin:24px 0 0;"><a href="${params.dashboardUrl}" style="display:inline-block;background:${params.accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:8px;">Open the project</a></p>`,
      `You received this because a client submitted a questionnaire.`,
    ),
    text: `The client submitted their questionnaire for ${projectName}. Open the project: ${params.dashboardUrl}`,
  };
}
