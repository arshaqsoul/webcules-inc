/* Booking-reminder engine (WEB-273) — the daily no-show fix, exact-once.
 *
 * The sweep finds bookings whose (startAt − offset) window has arrived,
 * claims each (booking, offset) pair with an INSERT..ON CONFLICT DO NOTHING
 * row in booking_reminders (the claim IS the dedupe — a retried cron, a
 * double pass, even a concurrent pair of requests can send at most once),
 * re-checks the booking is still live, then sends the branded reminder
 * (client copy gated by clientWantsEmail; optional studio heads-up). A send
 * that fails releases its claim so the next pass retries.
 *
 * Cadence math: the cron fires daily, so an offset is due when its send-time
 * falls within the NEXT ~25 h (25 > 24 cadence absorbs boundary skew; the
 * unique claim absorbs any overlap). Reminders never fire after the session
 * starts. */
import { and, gt, lte, ne, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import type { BookingReminderSettings } from "@/lib/availability";
import { DEFAULT_BOOKING_REMINDERS } from "@/lib/availability";
import { getBookingSettings } from "@/lib/repos/availability";
import { clientWantsEmail } from "@/lib/notify-client";
import { getEmailBrand } from "@/lib/branding";
import { getStudioProfile } from "@/lib/repos/studios";
import { ensureManageToken } from "@/lib/repos/booking-manage";
import { buildSingleEventIcs, icsAttachment } from "@/lib/ics";
import { bookingReminderEmail, bookingReminderStudioEmail, icsCopyFor, sendEmail } from "@/lib/email";
import { clientUrl } from "@/lib/client-urls";

/** Upper bound on a configurable offset (zod enforces the same). */
export const MAX_REMINDER_OFFSET_H = 168;

/** Resolve + sanitize the org's reminder settings over shipped defaults. */
export function reminderSettings(settings: { reminders?: BookingReminderSettings }): BookingReminderSettings {
  const r = settings.reminders;
  if (!r) return DEFAULT_BOOKING_REMINDERS;
  const offsets = [...new Set((Array.isArray(r.offsetsHours) ? r.offsetsHours : DEFAULT_BOOKING_REMINDERS.offsetsHours)
    .map((h) => Math.floor(Number(h)))
    .filter((h) => Number.isFinite(h) && h >= 1 && h <= MAX_REMINDER_OFFSET_H))]
    .sort((a, b) => b - a)
    .slice(0, 3);
  return {
    enabled: r.enabled !== false,
    offsetsHours: offsets.length ? offsets : DEFAULT_BOOKING_REMINDERS.offsetsHours,
    sendTo: r.sendTo === "client+studio" ? "client+studio" : "client",
  };
}

export type ReminderSendRecord = {
  bookingId: string;
  organizationId: string;
  offsetHours: number;
  to: string;
  subject: string;
};

export type ReminderSweepResult = { due: number; sent: number; skippedOptOut: number; skippedStudio: number };

/** The daily pass. `sendImpl` is injectable for tests (the domain-sweep
 * pattern) — default is the real branded send. */
export async function runBookingReminderSweep(opts?: {
  now?: Date;
  sendImpl?: (params: {
    booking: typeof schema.bookings.$inferSelect;
    organizationId: string;
    offsetHours: number;
  }) => Promise<"sent" | "skipped_opt_out" | "skipped_studio" | "failed">;
}): Promise<ReminderSweepResult> {
  const now = opts?.now ?? new Date();
  const db = getDb();
  const send = opts?.sendImpl ?? sendReminder;

  // Candidates: live bookings starting after now, within the largest legal
  // offset window. O(due-bookings) — one indexed window query.
  const candidates = await db
    .select()
    .from(schema.bookings)
    .where(
      and(
        ne(schema.bookings.status, "canceled"),
        gt(schema.bookings.startAt, now),
        lte(schema.bookings.startAt, new Date(now.getTime() + MAX_REMINDER_OFFSET_H * 3600_000 + 25 * 3600_000)),
      ),
    )
    .limit(300);

  // Group by org → one settings fetch per org in the candidate set.
  const settingsCache = new Map<string, BookingReminderSettings>();
  const result: ReminderSweepResult = { due: 0, sent: 0, skippedOptOut: 0, skippedStudio: 0 };

  for (const booking of candidates) {
    let settings = settingsCache.get(booking.organizationId);
    if (settings === undefined) {
      settings = reminderSettings(await getBookingSettings(booking.organizationId));
      settingsCache.set(booking.organizationId, settings);
    }
    if (!settings.enabled) continue;

    for (const offsetHours of settings.offsetsHours) {
      const sendAtMs = booking.startAt.getTime() - offsetHours * 3600_000;
      // Due when the send-time falls within the next daily window and the
      // session hasn't started (checked live above; re-checked in the claim).
      if (!(sendAtMs <= now.getTime() + 25 * 3600_000) || sendAtMs + 25 * 3600_000 < now.getTime()) continue;
      result.due++;

      // The exact-once claim: only the writer of the row sends.
      const claim = await db.run(sql`
        INSERT INTO booking_reminders (booking_id, organization_id, offset_hours, sent_at)
        VALUES (${booking.id}, ${booking.organizationId}, ${offsetHours}, ${Math.floor(now.getTime() / 1000)})
        ON CONFLICT (booking_id, offset_hours) DO NOTHING
      `);
      if ((claim.meta?.rows_written ?? 0) === 0) continue; // someone already sent it

      const outcome = await send({ booking, organizationId: booking.organizationId, offsetHours });
      if (outcome === "sent") {
        result.sent++;
      } else if (outcome === "skipped_opt_out") {
        result.skippedOptOut++;
        // The client opted out — the reminder served its purpose; the claim
        // STAYS so the sweep doesn't re-evaluate it every day.
      } else if (outcome === "skipped_studio") {
        result.skippedStudio++;
      } else {
        // failed send — release the claim so the next pass retries.
        await db.run(sql`DELETE FROM booking_reminders WHERE booking_id = ${booking.id} AND offset_hours = ${offsetHours}`);
      }
    }
  }
  return result;
}

/** The real branded send: reminder to the client (opt-out honored, .ics
 * attached) + optional studio heads-up. */
async function sendReminder(params: {
  booking: typeof schema.bookings.$inferSelect;
  organizationId: string;
  offsetHours: number;
}): Promise<"sent" | "skipped_opt_out" | "skipped_studio" | "failed"> {
  try {
    const [profile, b] = await Promise.all([
      getStudioProfile(params.organizationId),
      getEmailBrand(params.organizationId),
    ]);
    if (!profile) return "skipped_studio";

    const settings = reminderSettings(await getBookingSettings(params.organizationId));
    let sent = false;

    if (await clientWantsEmail(params.organizationId, params.booking.clientEmail)) {
      const manageToken = await ensureManageToken(params.booking.id);
      const manageUrl = manageToken ? await clientUrl(params.organizationId, `/booking/${manageToken}`) : null;
      const icsUrl = await clientUrl(params.organizationId, `/api/embed/ics?booking=${params.booking.id}&key=${profile.embedKey}`);
      const tmpl = bookingReminderEmail(profile.studioName, {
        clientName: params.booking.clientName ?? params.booking.clientEmail,
        startAt: params.booking.startAt,
        endAt: params.booking.endAt,
        tz: params.booking.timezone,
        icsUrl,
        manageUrl,
        accent: b.accent,
        whiteLabel: b.whiteLabel,
        emailHeaderUrl: b.emailHeaderUrl,
        contactEmail: b.contactEmail,
      });
      // The invite rides as a real attachment (WEB-273); the link stays in
      // the body for webmail clients that hide attachments.
      const sessionTypeName = params.booking.sessionTypeId
        ? ((await getDb().select({ name: schema.sessionTypes.name }).from(schema.sessionTypes).where(sql`${schema.sessionTypes.id} = ${params.booking.sessionTypeId}`).limit(1))[0]?.name ?? null)
        : null;
      const copy = icsCopyFor(profile.studioName, { sessionTypeName, manageUrl, whiteLabel: b.whiteLabel });
      const ics = buildSingleEventIcs({
        uid: params.booking.id,
        startAt: params.booking.startAt,
        endAt: params.booking.endAt,
        summary: copy.summary,
        description: copy.description,
        status: params.booking.status === "confirmed" ? "CONFIRMED" : "TENTATIVE",
      });
      sent =
        (await sendEmail({
          to: params.booking.clientEmail,
          subject: tmpl.subject,
          html: tmpl.html,
          text: tmpl.text,
          ...(b.whiteLabel ? { fromName: profile.studioName } : {}),
          organizationId: params.organizationId,
          template: "booking.reminder_client",
          refId: params.booking.id,
          attachments: [icsAttachment(ics, params.booking.id)],
        })) || sent;
    } else {
      return "skipped_opt_out";
    }

    if (settings.sendTo === "client+studio" && profile.contactEmail) {
      const studio = bookingReminderStudioEmail(profile.studioName, {
        clientName: params.booking.clientName ?? params.booking.clientEmail,
        startAt: params.booking.startAt,
        tz: params.booking.timezone,
        accent: b.accent,
      });
      await sendEmail({
        to: profile.contactEmail,
        subject: studio.subject,
        html: studio.html,
        text: studio.text,
        replyTo: params.booking.clientEmail,
        organizationId: params.organizationId,
        template: "booking.reminder_studio",
        refId: params.booking.id,
      });
    }

    // In dev/tests the EMAIL binding is absent → sendEmail false. The sweep
    // treats that as failed and releases the claim (retry semantics match
    // the expiry-reminder house pattern).
    return sent ? "sent" : "failed";
  } catch (err) {
    console.error("reminder send failed:", String(err));
    return "failed";
  }
}
