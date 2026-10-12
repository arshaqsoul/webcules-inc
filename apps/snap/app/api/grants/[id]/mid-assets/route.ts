/* /api/grants/{id}/mid-assets (WEB-196) — paged asset IDs for the
 * browser-side "prepare 1280px size" backfill in the share panel. The
 * studio's browser loops: fetch preview → canvas downscale to ~1280 →
 * POST /api/assets/{id}/derivative (kind=mid). Keyset pagination on id
 * keeps resume cheap; only images in this grant with a clean preview and
 * no stored mid are eligible (the mid is rendered from the preview). */
import { and, asc, eq, gt, isNotNull, isNull } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const grant = (
    await getDb()
      .select({ id: schema.shareGrants.id })
      .from(schema.shareGrants)
      .where(and(eq(schema.shareGrants.id, id), eq(schema.shareGrants.organizationId, ctx.organizationId)))
      .limit(1)
  )[0];
  if (!grant) return Response.json({ error: "not_found" }, { status: 404 });

  const url = new URL(req.url);
  const after = url.searchParams.get("after") ?? "";
  const limit = Math.min(100, Math.max(10, Number(url.searchParams.get("limit") ?? 50)));

  const rows = await getDb()
    .select({ id: schema.assets.id })
    .from(schema.shareGrantAssets)
    .innerJoin(schema.assets, eq(schema.assets.id, schema.shareGrantAssets.assetId))
    .where(
      and(
        eq(schema.shareGrantAssets.grantId, grant.id),
        eq(schema.assets.organizationId, ctx.organizationId),
        eq(schema.assets.kind, "image"),
        isNotNull(schema.assets.previewKey),
        isNull(schema.assets.midKey),
        ...(after ? [gt(schema.assets.id, after)] : []),
      ),
    )
    .orderBy(asc(schema.assets.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return Response.json({
    ids: page.map((r) => r.id),
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
  });
}
