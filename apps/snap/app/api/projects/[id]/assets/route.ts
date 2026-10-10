/* Curation data feed (WEB-120/121) — paged asset list + counts + tag cloud
 * for the project Files experience. Query: status, kind, tag, sort, cursor,
 * folder ("none" = unfiled, else folder id — WEB-216), quality
 * ("blurry"/"under"/"over"), edited ("yes"/"none"), group ("dupes")
 * — WEB-401/402 cull assist. */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { groupSizes, listAssetsPaged, listProjectTags, qualityCounts, ratingCounts, statusCounts, type AssetFilter } from "@/lib/repos/assets";
import { listFolders } from "@/lib/repos/folders";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

const SORTS = new Set(["date", "name", "size", "status"]);
const QUALITY = new Set(["blurry", "under", "over"]);
const EDITED = new Set(["yes", "none"]);

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
  const RATING = new Set(["unrated", "1", "2", "3", "4", "5"]);
  const COLOR = new Set(["none", "1", "2", "3", "4", "5"]);
  const folder = q.get("folder"); // "" and null both mean unfiltered
  const filter: AssetFilter = {
    status: q.get("status"),
    kind: q.get("kind"),
    tag: q.get("tag"),
    sort: (SORTS.has(q.get("sort") ?? "") ? q.get("sort") : "date") as AssetFilter["sort"],
    cursor: q.get("cursor"),
    limit: q.get("limit") ? Number(q.get("limit")) : undefined,
    rating: RATING.has(q.get("rating") ?? "") ? q.get("rating") : undefined,
    color: COLOR.has(q.get("color") ?? "") ? q.get("color") : undefined,
    folder: folder || undefined,
    quality: QUALITY.has(q.get("quality") ?? "") ? q.get("quality") : undefined,
    edited: EDITED.has(q.get("edited") ?? "") ? q.get("edited") : undefined,
    group: q.get("group") === "dupes" ? "dupes" : undefined,
  };

  const [page, counts, tags, ratings, folderInfo, quality, groups] = await Promise.all([
    listAssetsPaged(ctx.organizationId, id, filter),
    statusCounts(ctx.organizationId, id),
    listProjectTags(ctx.organizationId, id),
    ratingCounts(ctx.organizationId, id),
    listFolders(ctx.organizationId, id),
    qualityCounts(ctx.organizationId, id),
    groupSizes(ctx.organizationId, id),
  ]);

  return Response.json({
    items: page.items.map((a) => ({
      id: a.id,
      filename: a.filename,
      kind: a.kind,
      status: a.status,
      bytes: a.bytes,
      mimeType: a.mimeType,
      width: a.width,
      height: a.height,
      exifStripped: a.exifStripped,
      stars: a.stars,
      color: a.color,
      rawArchivedAt: a.rawArchivedAt,
      folderId: a.folderId,
      tags: a.tags,
      createdAt: a.createdAt.toISOString(),
      capturedAt: a.capturedAt && a.capturedAt > 0 ? a.capturedAt : null,
      colorKey: a.colorKey,
      // WEB-401/402: cull-assist fields (null when never analyzed/uploaded
      // before this feature — UI hides flags for those).
      analysis: a.analysis ? JSON.parse(a.analysis) : null,
      edits: a.edits ? JSON.parse(a.edits) : null,
      editedRendered: Boolean(a.editKey),
      groupCover: a.groupCover,
    })),
    nextCursor: page.nextCursor,
    counts,
    tags,
    ratings,
    folders: folderInfo.folders,
    unfiledCount: folderInfo.unfiledCount,
    quality,
    groupSizes: groups,
  });
}
