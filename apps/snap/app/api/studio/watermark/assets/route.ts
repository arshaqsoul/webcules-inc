/* WEB-242: paged asset IDs for the browser-side bulk watermark backfill.
 * The client loops: fetch preview → canvas composite → POST derivative
 * (replace=1). Keyset pagination on id keeps resume cheap; only images with
 * an existing clean preview are eligible (wm is built from the preview). */
import { permissionDenied } from "@/lib/permissions";
import { and, asc, eq, gt, isNotNull, like } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getPlanEntitlements } from "@/lib/plans";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "settings.write");
  if (denied) return denied;

  const ent = await getPlanEntitlements(ctx.organizationId);
  if (!ent?.whiteLabel) return Response.json({ error: "plan_required" }, { status: 403 });

  const url = new URL(req.url);
  const after = url.searchParams.get("after") ?? "";
  const limit = Math.min(100, Math.max(10, Number(url.searchParams.get("limit") ?? 50)));

  const rows = await getDb()
    .select({ id: schema.assets.id, kind: schema.assets.kind })
    .from(schema.assets)
    .where(
      and(
        eq(schema.assets.organizationId, ctx.organizationId),
        eq(schema.assets.kind, "image"),
        isNotNull(schema.assets.previewKey),
        like(schema.assets.mimeType, "image/%"),
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
