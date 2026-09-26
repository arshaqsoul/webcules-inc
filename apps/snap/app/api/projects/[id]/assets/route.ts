/* Curation data feed (WEB-120/121) — paged asset list + counts + tag cloud
 * for the project Files experience. Query: status, kind, tag, sort, cursor. */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { listAssetsPaged, listProjectTags, statusCounts, type AssetFilter } from "@/lib/repos/assets";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

const SORTS = new Set(["date", "name", "size", "status"]);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const url = new URL(req.url);
  const q = url.searchParams;
  const filter: AssetFilter = {
    status: q.get("status"),
    kind: q.get("kind"),
    tag: q.get("tag"),
    sort: (SORTS.has(q.get("sort") ?? "") ? q.get("sort") : "date") as AssetFilter["sort"],
    cursor: q.get("cursor"),
    limit: q.get("limit") ? Number(q.get("limit")) : undefined,
  };

  const [page, counts, tags] = await Promise.all([
    listAssetsPaged(ctx.organizationId, id, filter),
    statusCounts(ctx.organizationId, id),
    listProjectTags(ctx.organizationId, id),
  ]);

  return Response.json({
    items: page.items.map((a) => ({
      id: a.id,
      filename: a.filename,
      kind: a.kind,
      status: a.status,
      bytes: a.bytes,
      mimeType: a.mimeType,
      tags: a.tags,
      createdAt: a.createdAt.toISOString(),
    })),
    nextCursor: page.nextCursor,
    counts,
    tags,
  });
}
