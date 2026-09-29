/* /api/grants/{id}/lifecycle (WEB-266) — the studio's guest + lifecycle
 * controls: guest list (with CSV export), open+notify a scheduled gallery,
 * "new photos added" notification, and scheduling/unscheduling. Lite+ gate
 * (guest capture / pre-registration per WEB-267). */
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";
import { getPlanEntitlements } from "@/lib/plans";
import { listGuests, notifyGalleryUpdated, openScheduledGrant } from "@/lib/repos/gallery-guests";

export const dynamic = "force-dynamic";

async function ownedGrant(organizationId: string, id: string) {
  return (
    await getDb()
      .select()
      .from(schema.shareGrants)
      .where(and(eq(schema.shareGrants.id, id), eq(schema.shareGrants.organizationId, organizationId)))
      .limit(1)
  )[0];
}

function csvCell(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

const bodySchema = z.object({
  action: z.enum(["open", "schedule", "notify-updated"]),
  openAt: z.string().datetime().optional().nullable(),
  newCount: z.number().int().min(1).max(100_000).optional(),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const grant = await ownedGrant(ctx.organizationId, id);
  if (!grant) return Response.json({ error: "not_found" }, { status: 404 });

  const guests = await listGuests(ctx.organizationId, id);
  if (new URL(req.url).searchParams.get("format") === "csv") {
    const rows = ["email,kind,registered_at", ...guests.map((g) => [csvCell(g.email), csvCell(g.kind), csvCell(g.createdAt.toISOString())].join(","))];
    return new Response(rows.join("\n"), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="guests.csv"' },
    });
  }
  return Response.json({
    guests: guests.map((g) => ({ email: g.email, kind: g.kind, createdAt: g.createdAt.toISOString(), notifiedAt: g.notifiedAt })),
    openAt: grant.openAt ? grant.openAt.toISOString() : null,
    updatedNotifyAt: grant.updatedNotifyAt ? grant.updatedNotifyAt.toISOString() : null,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const grant = await ownedGrant(ctx.organizationId, id);
  if (!grant) return Response.json({ error: "not_found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  if (parsed.data.action === "schedule") {
    const ent = await getPlanEntitlements(ctx.organizationId);
    if ((ent?.id ?? "free") === "free") return Response.json({ error: "scheduling_requires_lite" }, { status: 403 });
    const openAt = parsed.data.openAt ? new Date(parsed.data.openAt) : null;
    if (openAt && Number.isNaN(openAt.getTime())) return Response.json({ error: "invalid_date" }, { status: 400 });
    await getDb().update(schema.shareGrants).set({ openAt }).where(eq(schema.shareGrants.id, id));
    return Response.json({ ok: true, openAt: openAt ? openAt.toISOString() : null });
  }

  if (parsed.data.action === "open") {
    const result = await openScheduledGrant(ctx.organizationId, id, ctx.user.id);
    return Response.json(result);
  }

  // notify-updated
  if (!parsed.data.newCount) return Response.json({ error: "invalid_body" }, { status: 400 });
  const sent = await notifyGalleryUpdated(ctx.organizationId, id, parsed.data.newCount, ctx.user.id);
  return Response.json({ ok: sent }, { status: sent ? 200 : 409 });
}
