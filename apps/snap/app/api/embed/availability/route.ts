/* Public availability for the calendar widget — a month of bookable slots
 * (studio tz), grouped by calendar date. */
import { monthDates } from "@/lib/availability";
import { originAllowed, resolveStudioByEmbedKey } from "@/lib/embed";
import { computeDateSlots } from "@/lib/repos/availability";
import { getStudioProfile } from "@/lib/repos/studios";

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

  const days: Record<string, string[]> = {};
  await Promise.all(
    monthDates(month).map(async (date) => {
      const { slots } = await computeDateSlots(studio.organizationId, tz, date);
      if (slots.length) days[date] = slots.map((s) => s.startAt.toISOString());
    }),
  );

  return Response.json(
    { studioName: studio.studioName, timezone: tz, month, days },
    { headers: { "Cache-Control": "no-store" } },
  );
}
