/* ICS calendar file for a booking — one-click "Add to calendar" from emails
 * and the manage page. Addressed by unguessable booking UUID + embed key;
 * built by the shared generator (lib/ics.ts) so the feed and email
 * attachments can never drift. Booking times are UTC in TZID-less form
 * (imported correctly by all major clients). */
import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { buildSingleEventIcs } from "@/lib/ics";
import { isWhiteLabeled } from "@/lib/branding";
import { resolveStudioByEmbedKey } from "@/lib/embed";
import { getPlanEntitlements } from "@/lib/plans";
import { getBookingByRef } from "@/lib/repos/bookings";

export const dynamic = "force-dynamic";

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

  // WEB-238: the visible DESCRIPTION drops "via Snap" for white-labeled
  // studios.
  const wl = isWhiteLabeled(await getPlanEntitlements(studio.organizationId), studio.brand);
  const sessionTypeName = booking.sessionTypeId
    ? ((await getDb().select({ name: schema.sessionTypes.name }).from(schema.sessionTypes).where(eq(schema.sessionTypes.id, booking.sessionTypeId)).limit(1))[0]?.name ?? null)
    : null;
  const sessionTitle = sessionTypeName ? `${sessionTypeName} — ${studio.studioName}` : `Photo session — ${studio.studioName}`;

  const ics = buildSingleEventIcs(
    {
      uid: booking.id,
      startAt: booking.startAt,
      endAt: booking.endAt,
      summary: sessionTitle,
      description: wl
        ? `Session with ${studio.studioName}.`
        : `Session with ${studio.studioName}. Booked via Snap.`,
      status: booking.status === "confirmed" ? "CONFIRMED" : "TENTATIVE",
    },
    { whiteLabel: wl },
  );

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="session-${bookingId.slice(0, 8)}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
