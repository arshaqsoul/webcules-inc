/* GET/PUT /api/studio/booking-page (WEB-254) — the booking page designer.
 * Lite+ gate on write; reads are open so Free studios can see what they'd
 * get (the public page keeps today's defaults). */
import { permissionDenied } from "@/lib/permissions";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";
import { getPlanEntitlements } from "@/lib/plans";
import { parseBookingPageConfig, validateBookingPageConfig, EMPTY_BOOKING_PAGE } from "@/lib/booking-page";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "settings.write");
  if (denied) return denied;
  const profile = (await getDb().select({ bookingPage: schema.studioProfiles.bookingPage }).from(schema.studioProfiles).where(eq(schema.studioProfiles.organizationId, ctx.organizationId)).limit(1))[0];
  const ent = await getPlanEntitlements(ctx.organizationId);
  return Response.json({ config: parseBookingPageConfig(profile?.bookingPage ?? null), canEdit: ent ? ent.id !== "free" : false });
}

export async function PUT(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "settings.write");
  if (denied) return denied;
  const ent = await getPlanEntitlements(ctx.organizationId);
  if (!ent || ent.id === "free") return Response.json({ error: "lite_required" }, { status: 403 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const config = validateBookingPageConfig(body);
  if (!config) return Response.json({ error: "invalid_config" }, { status: 400 });
  const json = JSON.stringify(config);
  if (json.length > 32 * 1024) return Response.json({ error: "too_large" }, { status: 400 });
  // Empty == reset to defaults — store null so the page renders the shipped copy.
  const isEmpty = JSON.stringify(config) === JSON.stringify(EMPTY_BOOKING_PAGE);
  await getDb()
    .update(schema.studioProfiles)
    .set({ bookingPage: isEmpty ? null : json, updatedAt: new Date() })
    .where(eq(schema.studioProfiles.organizationId, ctx.organizationId));
  return Response.json({ ok: true, config });
}
