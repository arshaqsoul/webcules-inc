/* /api/studio/session-types (WEB-250) — the event-type definer's CRUD.
 * Tier gate: maxSessionTypes (Free 1 · Lite 3 · Studio+ unlimited). */
import { z } from "zod";

import { getOrgContext } from "@/lib/session";
import { getPlanEntitlements } from "@/lib/plans";
import { countActiveSessionTypes, createSessionType, listSessionTypes } from "@/lib/repos/session-types";

export const dynamic = "force-dynamic";

export const sessionTypeInput = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500).optional().nullable(),
  color: z.string().trim().max(7).optional().nullable(),
  icon: z.string().trim().max(20).optional().nullable(),
  slotMinutes: z.number().int().min(5).max(1440).optional().nullable(),
  bufferMinutes: z.number().int().min(0).max(1440).optional().nullable(),
  minLeadHours: z.number().int().min(0).max(8760).optional().nullable(),
  maxAdvanceDays: z.number().int().min(1).max(730).optional().nullable(),
  priceMinor: z.number().int().min(0).optional().nullable(),
  depositKind: z.enum(["off", "deposit", "full"]).optional().nullable(),
  depositMinor: z.number().int().min(1).optional().nullable(),
  availabilityMode: z.enum(["inherit", "own"]).optional(),
  bookingFormTemplateId: z.string().optional().nullable(),
  galleryDefaults: z.record(z.string(), z.unknown()).optional().nullable(),
  active: z.boolean().optional(),
});

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const [types, ent] = await Promise.all([listSessionTypes(ctx.organizationId, { includeInactive: true }), getPlanEntitlements(ctx.organizationId)]);
  return Response.json({ types, limit: ent?.maxSessionTypes ?? null });
}

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  let body: z.infer<typeof sessionTypeInput>;
  try {
    body = sessionTypeInput.parse(await req.json());
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const ent = await getPlanEntitlements(ctx.organizationId);
  const result = await createSessionType(ctx.organizationId, body, ent?.maxSessionTypes ?? null);
  if (!result.ok) {
    const status = result.error === "limit_reached" ? 403 : 400;
    return Response.json({ error: result.error, ...(result.error === "limit_reached" ? { limit: ent?.maxSessionTypes ?? null } : {}) }, { status });
  }
  return Response.json({ id: result.type.id });
}
