/* Public availability for the calendar widget — a month of bookable slots
 * (studio tz), grouped by calendar date. WEB-272: `manage=<token>` scopes
 * the payload to a manage-booking reschedule — the session type is forced to
 * the booking's and the booking's own row is excluded from conflicts (its
 * current slot must not block the neighboring slots the move targets). */
import { monthDates } from "@/lib/availability";
import { originAllowed, resolveStudioByEmbedKey } from "@/lib/embed";
import { computeDateSlots } from "@/lib/repos/availability";
import { getSessionTypeBySlug } from "@/lib/repos/session-types";
import { getStudioProfile } from "@/lib/repos/studios";
import { resolveBookingByManageToken } from "@/lib/repos/booking-manage";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? "";
  const month = (url.searchParams.get("month") ?? "").replace(/^(\d{4}-\d{2}).*$/, "$1");
  const studio = await resolveStudioByEmbedKey(key);
  if (!studio) return Response.json({ error: "invalid_key" }, { status: 404 });
  if (!originAllowed(studio, req.headers.get("Origin"))) {
    return Response.json({ error: "origin_not_allowed" }, { status: 403 });
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return Response.json({ error: "invalid_month", format: "YYYY-MM" }, { status: 400 });
  }

  const profile = await getStudioProfile(studio.organizationId);
  const tz = profile?.timezone ?? "UTC";
  const manageToken = (url.searchParams.get("manage") ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  const manageBooking = manageToken ? await resolveBookingByManageToken(manageToken) : null;
  // A manage token from another studio never widens access — it just fails
  // to scope (the widget then refuses to submit; slots shown are generic).
  const manageOk = Boolean(manageBooking) && manageBooking!.organizationId === studio.organizationId;
  const typeSlug = (url.searchParams.get("type") ?? "").replace(/[^a-z0-9-]/gi, "").slice(0, 40);
  const type = typeSlug ? await getSessionTypeBySlug(studio.organizationId, typeSlug) : null;
  const scopeTypeId = manageOk && manageBooking!.sessionTypeId ? manageBooking!.sessionTypeId : (type?.id ?? null);
  const excludeBookingId = manageOk ? manageBooking!.id : null;

  const days: Record<string, string[]> = {};
  await Promise.all(
    monthDates(month).map(async (date) => {
      const { slots } = await computeDateSlots(studio.organizationId, tz, date, scopeTypeId, excludeBookingId);
      if (slots.length) days[date] = slots.map((s) => s.startAt.toISOString());
    }),
  );

  return Response.json(
    { studioName: studio.studioName, timezone: tz, month, days },
    { headers: { "Cache-Control": "no-store" } },
  );
}
