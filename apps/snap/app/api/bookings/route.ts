/* GET /api/bookings?month=YYYY-MM — the month's bookings for the caller's
 * studio. Backs the dashboard calendar's client-side refetches (month nav,
 * focus/visibility after bookings made elsewhere, post-cancel truth sync). */
import { listBookingsInRange } from "@/lib/repos/bookings";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const month = new URL(req.url).searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return Response.json({ error: "invalid_month" }, { status: 400 });

  const [y, m] = month.split("-").map(Number);
  // Start = 1st UTC; end = LAST day of the month (Date.UTC day 0 of the next
  // month) — correct for 28/29/30-day months and covers tz spill at edges.
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59));
  const bookings = await listBookingsInRange(ctx.organizationId, start, end);

  return Response.json({
    bookings: bookings.map((b) => ({
      id: b.id,
      startAt: b.startAt.toISOString(),
      clientName: b.clientName ?? b.clientEmail,
      status: b.status,
    })),
  });
}
