/* /api/projects/{id}/asset-views (WEB-265) — per-photo interest totals for
 * the heat overlay (aggregated from the monthly counters, never row scans).
 * Studio+ gate per WEB-267 ("Per-photo analytics"). */
import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";
import { getPlanEntitlements } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const project = (
    await getDb()
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, id), eq(schema.projects.organizationId, ctx.organizationId)))
      .limit(1)
  )[0];
  if (!project) return Response.json({ error: "not_found" }, { status: 404 });

  const ent = await getPlanEntitlements(ctx.organizationId);
  if (ent?.id !== "studio" && ent?.id !== "pro") {
    return Response.json({ error: "insights_require_studio" }, { status: 403 });
  }

  // All-time totals per asset across this project's grants (aggregate).
  const rows = await getDb().all<{ asset_id: string; n: number }>(sql`
    SELECT v.asset_id, SUM(v.views) AS n
    FROM asset_view_monthly v
    JOIN share_grant g ON g.id = v.grant_id
    WHERE g.project_id = ${id} AND g.organization_id = ${ctx.organizationId}
    GROUP BY v.asset_id
  `);
  return Response.json({ views: rows.map((r) => ({ assetId: r.asset_id, views: r.n })) });
}
