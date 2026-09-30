/* Open slots for ONE booking's reschedule picker (WEB-272) — scoped to the
 * booking's session type with the booking's own row excluded, so the studio
 * sees exactly the slots the client's manage page would offer (the same
 * engine, the same exclusions). */
import { and, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { computeDateSlots } from "@/lib/repos/availability";
import { getStudioProfile } from "@/lib/repos/studios";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const date = new URL(req.url).searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "invalid_date" }, { status: 400 });

  const booking = (
    await getDb()
      .select()
      .from(schema.bookings)
      .where(and(eq(schema.bookings.id, id), eq(schema.bookings.organizationId, ctx.organizationId)))
      .limit(1)
  )[0];
  if (!booking) return Response.json({ error: "not_found" }, { status: 404 });

  const profile = await getStudioProfile(ctx.organizationId);
  const tz = profile?.timezone ?? "UTC";
  const { slots } = await computeDateSlots(ctx.organizationId, tz, date, booking.sessionTypeId, booking.id);
  return Response.json({
    tz,
    slots: slots.map((s) => ({ startAt: s.startAt.toISOString(), endAt: s.endAt.toISOString() })),
  });
}
