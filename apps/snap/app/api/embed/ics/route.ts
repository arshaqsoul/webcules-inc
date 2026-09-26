/* ICS calendar file for a booking — one-click "Add to calendar" from emails.
 * Addressed by unguessable booking UUID + embed key; booking times are UTC
 * with a TZID-less UTC form (imported correctly by all major clients). */
import { resolveStudioByEmbedKey } from "@/lib/embed";
import { getBookingByRef } from "@/lib/repos/bookings";

export const dynamic = "force-dynamic";

function icsStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const bookingId = url.searchParams.get("booking") ?? "";
  const key = url.searchParams.get("key") ?? "";

  const studio = await resolveStudioByEmbedKey(key);
  if (!studio) return new Response("not found", { status: 404 });
  const booking = await getBookingByRef(bookingId);
  if (!booking || booking.organizationId !== studio.organizationId || booking.status === "canceled") {
    return new Response("not found", { status: 404 });
  }

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Snap//Bookings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${booking.id}@snap.webcules.com`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(booking.startAt)}`,
    `DTEND:${icsStamp(booking.endAt)}`,
    `SUMMARY:${esc(`Photo session — ${studio.studioName}`)}`,
    `DESCRIPTION:${esc(`Session with ${studio.studioName}. Booked via Snap.`)}`,
    `STATUS:${booking.status === "confirmed" ? "CONFIRMED" : "TENTATIVE"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="session-${bookingId.slice(0, 8)}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
