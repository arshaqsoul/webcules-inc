/* Shared single-event ICS generator (WEB-273) — one code path for the
 * "Add to calendar" endpoint (/api/embed/ics) and email attachments. Times
 * are UTC in TZID-less basic form: every major client (Google / Apple /
 * Outlook) imports them correctly, and Outlook notoriously fails to resolve
 * bare TZIDs without a full VTIMEZONE block. UID stays
 * {bookingId}@snap.webcules.com — stable per booking, so a re-downloaded
 * file after a reschedule updates the SAME event instead of duplicating. */

export function icsStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export type IcsEvent = {
  /** Stable UID local part — the booking id. */
  uid: string;
  startAt: Date;
  endAt: Date;
  summary: string;
  description: string;
  /** CONFIRMED | TENTATIVE | CANCELLED */
  status: "CONFIRMED" | "TENTATIVE" | "CANCELLED";
};

export function buildSingleEventIcs(event: IcsEvent, opts?: { whiteLabel?: boolean }): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    // PRODID stays the producing software (standard ICS practice); the
    // human-visible copy honors white-labeling, PRODID does not.
    "PRODID:-//Snap//Bookings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}@snap.webcules.com`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(event.startAt)}`,
    `DTEND:${icsStamp(event.endAt)}`,
    `SUMMARY:${icsEscape(event.summary)}`,
    `DESCRIPTION:${icsEscape(event.description)}`,
    `STATUS:${event.status}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Attachment shape accepted by sendEmail → the Cloudflare Email binding. */
export type IcsAttachment = {
  filename: string;
  type: string;
  content: string;
  disposition: "attachment";
};

export function icsAttachment(ics: string, bookingId: string): IcsAttachment {
  return {
    filename: `session-${bookingId.slice(0, 8)}.ics`,
    type: "text/calendar; charset=utf-8",
    content: ics,
    disposition: "attachment",
  };
}
