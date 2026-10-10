/* Asset repository — R2-backed project media. Keys are always
 * {orgId}/{projectId}/{assetId}/{filename}; every operation re-verifies the
 * org + project ownership. Status: uploaded → approved/rejected → shared. */
import { isValidColorKey } from "../color-sort";
import { forEachChunk, selectInChunks } from "../db-chunk";
import { clusterSimilar, isValidPhash, type ImageAnalysis } from "../image-analysis";
import { autoEdits, isEmptyEdits, normalizeEditSet, type PartialEdits } from "../edits";
import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { buildKey, deleteObject, putObject } from "@/lib/storage/service";

export const ASKINDS = ["image", "video", "raw", "other"] as const;

const EXT_KIND: Record<string, (typeof ASKINDS)[number]> = {
  jpg: "image", jpeg: "image", png: "image", webp: "image", avif: "image", heic: "image", gif: "image", bmp: "image",
  /* Studio/design/document set (kind "other"): no derivatives, icon +
   * download only; "other" bypasses the free-tier RAW/video gates, same as
   * every delivery platform treats supporting documents. */
  psd: "other", psb: "other", // Photoshop
  ai: "other", ait: "other", eps: "other", // Illustrator / PostScript
  aep: "other", aepx: "other", prproj: "other", // After Effects / Premiere
  indd: "other", // InDesign
  pdf: "other", svg: "other",
  mp3: "other", wav: "other", m4a: "other", aif: "other", aiff: "other", flac: "other", // slideshow audio
  mp4: "video", mov: "video", webm: "video",
  /* DJI Low Resolution File — a compressed MP4 proxy recorded alongside the
   * footage on drones/Osmo/Pocket (it sniffs as ISO-BMFF video; DJI's own
   * support page says rename to .mp4 to play it). */
  lrf: "video",
  /* Camera RAW — the full brand set so every camera lands in the Vault.
   * All TIFF-container formats (II/MM byte-order headers) are caught by
   * sniffKind's TIFF branch; the non-TIFF exceptions (Sigma X3F) have their
   * own magic there. kind="raw" feeds the free-tier trial pocket (plans.ts). */
  cr2: "raw", cr3: "raw", // Canon
  nef: "raw", nrw: "raw", // Nikon
  arw: "raw", srf: "raw", sr2: "raw", mrw: "raw", // Sony / Minolta
  raf: "raw", // Fuji
  orf: "raw", // Olympus / OM System
  rw2: "raw", raw: "raw", // Panasonic (+ generic RAW containers)
  tif: "raw", tiff: "raw", // TIFF — uncompressed print delivery (TIFF-container magic, RAW-vault lifecycle)
  rwl: "raw", // Leica
  lfr: "raw", // Lytro Light Field RAW (Illum) — PNG-chunk magic, sniffed separately
  pef: "raw", // Pentax
  x3f: "raw", // Sigma
  "3fr": "raw", fff: "raw", // Hasselblad
  iiq: "raw", // Phase One
  mef: "raw", // Mamiya
  erf: "raw", // Epson
  kdc: "raw", dcr: "raw", // Kodak
  mos: "raw", // Leaf
  srw: "raw", // Samsung
  gpr: "raw", // GoPro
  dng: "raw", // Adobe / generic
};

const ALLOWED_EXTENSIONS: Set<string> = new Set(Object.keys(EXT_KIND));
export { ALLOWED_EXTENSIONS };

/** Cap for worker-proxied uploads — direct-to-R2 presigned multipart (larger
 * files) arrives with the presign story; Workers request bodies cap ~100MB. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export function classifyUpload(filename: string): {
  ext: string;
  kind: (typeof ASKINDS)[number];
} | null {
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) return null;
  return { ext, kind: EXT_KIND[ext] };
}

export async function createAsset(params: {
  organizationId: string;
  projectId: string;
  uploadedBy: string;
  filename: string;
  mimeType: string;
  bytes: ArrayBuffer;
}): Promise<{ id: string } | { error: "unsupported_type" }> {
  const classified = classifyUpload(params.filename);
  if (!classified) return { error: "unsupported_type" };

  const db = getDb();
  const assetId = crypto.randomUUID();
  const safeName = params.filename.replace(/[^\w.\-() ]+/g, "_").slice(-120);
  const key = buildKey(params.organizationId, params.projectId, assetId, safeName);
  await putObject(params.organizationId, `${params.projectId}/${assetId}/${safeName}`, params.bytes, params.mimeType);

  await db.insert(schema.assets).values({
    id: assetId,
    organizationId: params.organizationId,
    projectId: params.projectId,
    storageKey: key,
    kind: classified.kind,
    filename: safeName,
    mimeType: params.mimeType,
    bytes: params.bytes.byteLength,
    uploadedBy: params.uploadedBy,
  });
  return { id: assetId };
}

export async function listAssets(organizationId: string, projectId: string) {
  const db = getDb();
  return db
    .select()
    .from(schema.assets)
    .where(and(eq(schema.assets.organizationId, organizationId), eq(schema.assets.projectId, projectId)))
    .orderBy(schema.assets.createdAt);
}

/** Curation query (WEB-120): filter by status/kind/tag, sort, keyset-paged.
 * Cursor = createdAt ISO of the last item (createdAt ties broken by id). */
export type AssetFilter = {
  status?: string | null;
  kind?: string | null;
  tag?: string | null; // "favorite" is a tag; "shared"/"approved" are statuses
  sort?: "date" | "name" | "size" | "status";
  cursor?: string | null; // `${createdAtMs}|${id}` for date sort; plain offset otherwise
  limit?: number;
  /** "unrated" = stars 0; "1".."5" = stars >= N (Lightroom attribute-filter semantics). */
  rating?: string | null;
  /** "none" = color 0; "1".."5" = that color. */
  color?: string | null;
  /** WEB-216 folders: "none" = unfiled bucket, anything else = folder id,
   * undefined/null = no folder filtering. */
  folder?: string | null;
  /** WEB-401 cull assist: "blurry" | "under" | "over" (analysis-derived flags). */
  quality?: string | null;
  /** WEB-402: "yes" = has edits, "none" = unedited. */
  edited?: string | null;
  /** WEB-401: "dupes" = member of a near-duplicate cluster. */
  group?: string | null;
};

export type AssetRow = typeof schema.assets.$inferSelect & { tags: string[] };

export async function listAssetsPaged(
  organizationId: string,
  projectId: string,
  filter: AssetFilter = {},
): Promise<{ items: AssetRow[]; nextCursor: string | null }> {
  const db = getDb();
  const limit = Math.min(filter.limit ?? 60, 200);
  const conditions = [eq(schema.assets.organizationId, organizationId), eq(schema.assets.projectId, projectId)];
  if (filter.status) conditions.push(eq(schema.assets.status, filter.status));
  if (filter.kind) conditions.push(eq(schema.assets.kind, filter.kind));
  if (filter.tag) {
    conditions.push(
      sql`(EXISTS (SELECT 1 FROM asset_tag t WHERE t.asset_id = ${schema.assets.id} AND t.tag = ${filter.tag}))`,
    );
  }
  if (filter.rating === "unrated") conditions.push(eq(schema.assets.stars, 0));
  else if (filter.rating && /^[1-5]$/.test(filter.rating)) conditions.push(gte(schema.assets.stars, Number(filter.rating)));
  if (filter.color === "none") conditions.push(eq(schema.assets.color, 0));
  else if (filter.color && /^[1-5]$/.test(filter.color)) conditions.push(eq(schema.assets.color, Number(filter.color)));
  if (filter.folder === "none") conditions.push(isNull(schema.assets.folderId));
  else if (filter.folder) conditions.push(eq(schema.assets.folderId, filter.folder));
  // WEB-401 quality flags — json_extract returns NULL for un-analyzed rows,
  // which compares false, so legacy assets simply never match a flag filter.
  if (filter.quality === "blurry")
    conditions.push(sql`json_extract(${schema.assets.analysis}, '$.sharp') < 16`);
  else if (filter.quality === "under")
    conditions.push(
      sql`(json_extract(${schema.assets.analysis}, '$.lum') < 20 OR json_extract(${schema.assets.analysis}, '$.clipDark') > 6)`,
    );
  else if (filter.quality === "over")
    conditions.push(
      sql`(json_extract(${schema.assets.analysis}, '$.lum') > 80 OR json_extract(${schema.assets.analysis}, '$.clipBright') > 6)`,
    );
  // WEB-402 edited filter — "has a look applied" (sparse edits stored).
  if (filter.edited === "yes") conditions.push(isNotNull(schema.assets.edits));
  else if (filter.edited === "none") conditions.push(isNull(schema.assets.edits));
  // WEB-401 near-duplicate cluster membership.
  if (filter.group === "dupes") conditions.push(isNotNull(schema.assets.groupCover));

  // Keyset only on the default date sort; others page by offset via cursor-as-number.
  const offset = filter.sort && filter.sort !== "date" ? Number(filter.cursor ?? 0) || 0 : 0;
  const orderBy =
    filter.sort === "name"
      ? [schema.assets.filename]
      : filter.sort === "size"
        ? [desc(schema.assets.bytes)]
        : filter.sort === "status"
          ? [schema.assets.status, desc(schema.assets.createdAt)]
          : [desc(schema.assets.createdAt), desc(schema.assets.id)];

  let rows: (typeof schema.assets.$inferSelect)[];
  if (filter.sort === "date" && filter.cursor) {
    const [ms, id] = filter.cursor.split("|");
    conditions.push(
      sql`(${schema.assets.createdAt} < ${new Date(Number(ms))} OR (${schema.assets.createdAt} = ${new Date(Number(ms))} AND ${schema.assets.id} < ${id}))`,
    );
    rows = await db.select().from(schema.assets).where(and(...conditions)).orderBy(...orderBy).limit(limit);
  } else {
    rows = await db.select().from(schema.assets).where(and(...conditions)).orderBy(...orderBy).limit(limit).offset(offset);
  }

  const items = await attachTags(rows);
  let nextCursor: string | null = null;
  if (rows.length === limit) {
    const last = rows[rows.length - 1];
    nextCursor =
      !filter.sort || filter.sort === "date"
        ? `${last.createdAt.getTime()}|${last.id}`
        : String(offset + limit);
  }
  return { items, nextCursor };
}

/** Set stars/color on one asset (culling v2). Deliberately no audit row:
 * ratings are high-frequency, low-risk state — auditing them would double
 * D1 writes and drown the activity feed. */
export async function setAssetRating(
  organizationId: string,
  assetId: string,
  value: { stars?: number; color?: number },
): Promise<{ ok: true } | { ok: false; error: "not_found" }> {
  const db = getDb();
  const patch: { stars?: number; color?: number } = {};
  if (value.stars !== undefined) patch.stars = Math.max(0, Math.min(5, Math.trunc(value.stars)));
  if (value.color !== undefined) patch.color = Math.max(0, Math.min(5, Math.trunc(value.color)));
  if (!Object.keys(patch).length) return { ok: true };
  const res = await db
    .update(schema.assets)
    .set(patch)
    .where(and(eq(schema.assets.id, assetId), eq(schema.assets.organizationId, organizationId)))
    .returning({ id: schema.assets.id });
  return res.length ? { ok: true } : { ok: false, error: "not_found" };
}

/** audit_log rows are 8 bound columns each: 10 rows per statement stays under D1's 100-variable cap. */
async function insertAuditRows(db: ReturnType<typeof getDb>, rows: (typeof schema.auditLog.$inferInsert)[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 10) await db.insert(schema.auditLog).values(rows.slice(i, i + 10));
}

/** Bulk stars/color over an explicit id list — ONE update statement
 * (no per-row loop) since ratings are uniform by construction. */
export async function bulkSetRating(
  organizationId: string,
  assetIds: string[],
  value: { stars?: number; color?: number },
): Promise<number> {
  const db = getDb();
  const ids = assetIds.slice(0, 500);
  if (!ids.length) return 0;
  const patch: { stars?: number; color?: number } = {};
  if (value.stars !== undefined) patch.stars = Math.max(0, Math.min(5, Math.trunc(value.stars)));
  if (value.color !== undefined) patch.color = Math.max(0, Math.min(5, Math.trunc(value.color)));
  if (!Object.keys(patch).length) return 0;
  let done = 0;
  await forEachChunk(ids, async (chunk) => {
    const res = await db
      .update(schema.assets)
      .set(patch)
      .where(and(eq(schema.assets.organizationId, organizationId), inArray(schema.assets.id, chunk)))
      .returning({ id: schema.assets.id });
    done += res.length;
  });
  return done;
}

/** Marginal rating distributions for the filter menu — both GROUP BYs in
 * one D1 batch (single round trip). */
export async function ratingCounts(
  organizationId: string,
  projectId: string,
): Promise<{ stars: Record<string, number>; colors: Record<string, number> }> {
  const db = getDb();
  const where = and(eq(schema.assets.organizationId, organizationId), eq(schema.assets.projectId, projectId));
  const [starRows, colorRows] = await db.batch([
    db.select({ v: schema.assets.stars, n: sql<number>`count(*)` }).from(schema.assets).where(where).groupBy(schema.assets.stars),
    db.select({ v: schema.assets.color, n: sql<number>`count(*)` }).from(schema.assets).where(where).groupBy(schema.assets.color),
  ]);
  const stars: Record<string, number> = {};
  for (const r of starRows) stars[String(r.v)] = Number(r.n);
  const colors: Record<string, number> = {};
  for (const r of colorRows) colors[String(r.v)] = Number(r.n);
  return { stars, colors };
}

export async function statusCounts(organizationId: string, projectId: string): Promise<Record<string, number>> {
  const db = getDb();
  const rows = await db
    .select({ status: schema.assets.status, n: sql<number>`count(*)` })
    .from(schema.assets)
    .where(and(eq(schema.assets.organizationId, organizationId), eq(schema.assets.projectId, projectId)))
    .groupBy(schema.assets.status);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = r.n;
  return out;
}

async function attachTags(rows: (typeof schema.assets.$inferSelect)[]): Promise<AssetRow[]> {
  if (!rows.length) return [];
  const db = getDb();
  const tagRows = await selectInChunks(
    rows.map((r) => r.id),
    (chunk) => db.select().from(schema.assetTags).where(inArray(schema.assetTags.assetId, chunk)),
  );
  const byAsset = new Map<string, string[]>();
  for (const t of tagRows) {
    const list = byAsset.get(t.assetId) ?? [];
    list.push(t.tag);
    byAsset.set(t.assetId, list);
  }
  return rows.map((r) => ({ ...r, tags: byAsset.get(r.id) ?? [] }));
}

/* ---------------- Tags (WEB-121) ---------------- */

const MAX_TAG_LEN = 24;

export async function setAssetTag(organizationId: string, assetId: string, tag: string, on: boolean): Promise<void> {
  const db = getDb();
  const clean = tag.trim().toLowerCase().slice(0, MAX_TAG_LEN);
  if (!clean) return;
  if (on) {
    await db
      .insert(schema.assetTags)
      .values({ organizationId, assetId, tag: clean })
      .onConflictDoNothing();
  } else {
    await db
      .delete(schema.assetTags)
      .where(and(eq(schema.assetTags.assetId, assetId), eq(schema.assetTags.tag, clean)));
  }
}

export async function listProjectTags(organizationId: string, projectId: string): Promise<{ tag: string; n: number }[]> {
  const db = getDb();
  const rows = await db
    .select({ tag: schema.assetTags.tag, n: sql<number>`count(*)` })
    .from(schema.assetTags)
    .innerJoin(schema.assets, eq(schema.assets.id, schema.assetTags.assetId))
    .where(and(eq(schema.assetTags.organizationId, organizationId), eq(schema.assets.projectId, projectId)))
    .groupBy(schema.assetTags.tag)
    .orderBy(desc(sql`count(*)`));
  return rows.map((r) => ({ tag: r.tag, n: r.n }));
}

/* ---------------- Bulk operations (WEB-128) ---------------- */

export type BulkResult = { done: number; blocked: { assetId: string; reason: string }[] };

/** Bulk status change / tag / delete. Reject + delete respect the share-grant
 * guard per item; failures are isolated and reported, never all-or-nothing. */
export async function bulkAssetAction(
  organizationId: string,
  params: {
    action: "approve" | "reject" | "reset" | "delete" | "tag" | "untag";
    assetIds: string[];
    tag?: string;
    actorUserId: string;
  },
): Promise<BulkResult> {
  const result: BulkResult = { done: 0, blocked: [] };
  const ids = params.assetIds.slice(0, 500);

  // Delete runs batched: one assets fetch, one share-guard query, one row
  // delete, parallel R2 deletes — the per-asset loop made large selections
  // feel frozen (a query per file plus sequential object deletes).
  if (params.action === "delete" && ids.length) {
    const db = getDb();
    const assets = await selectInChunks(ids, (chunk) =>
      db
        .select({ id: schema.assets.id, storageKey: schema.assets.storageKey, thumbKey: schema.assets.thumbKey, previewKey: schema.assets.previewKey, projectId: schema.assets.projectId })
        .from(schema.assets)
        .where(and(eq(schema.assets.organizationId, organizationId), inArray(schema.assets.id, chunk))),
    );
    const foundIds = new Set(assets.map((a) => a.id));
    const guardedRows = await selectInChunks(
      assets.map((a) => a.id),
      (chunk) =>
        db
          .select({ assetId: schema.shareGrantAssets.assetId })
          .from(schema.shareGrantAssets)
          .innerJoin(schema.shareGrants, eq(schema.shareGrants.id, schema.shareGrantAssets.grantId))
          .where(
            and(
              inArray(schema.shareGrantAssets.assetId, chunk),
              eq(schema.shareGrants.status, "active"),
              or(isNull(schema.shareGrants.expiresAt), gt(schema.shareGrants.expiresAt, new Date())),
            ),
          ),
    );
    const guarded = new Set(guardedRows.map((r) => r.assetId));
    const doomed = assets.filter((a) => !guarded.has(a.id));
    if (doomed.length) {
      await forEachChunk(
        doomed.map((a) => a.id),
        (chunk) => db.delete(schema.assets).where(and(eq(schema.assets.organizationId, organizationId), inArray(schema.assets.id, chunk))),
      );
      await Promise.allSettled(
        doomed.flatMap((a) => [a.storageKey, a.thumbKey, a.previewKey].filter((k): k is string => Boolean(k)).map((k) => deleteObject(organizationId, k))),
      );
    }
    if (guarded.size) {
      await insertAuditRows(db, 
        Array.from(guarded).map((assetId) => ({
          id: crypto.randomUUID(),
          organizationId,
          actorType: "user" as const,
          actorId: params.actorUserId,
          action: "asset.delete_blocked",
          targetType: "asset" as const,
          targetId: assetId,
          meta: JSON.stringify({ reason: "active_share_grant", source: "bulk" }),
        })),
      );
    }
    result.done = doomed.length;
    result.blocked = [
      ...Array.from(guarded).map((assetId) => ({ assetId, reason: "active client gallery" })),
      ...ids.filter((id) => !foundIds.has(id)).map((assetId) => ({ assetId, reason: "not found" })),
    ];
    // Project attribution must be captured before the rows are deleted.
    return finishBulkAudit(organizationId, params, result, assets[0]?.projectId ?? null);
  }

  // Status changes and tags run batched too — one ownership select, one
  // (reject-only) guard select, ONE update/insert/delete for the whole set.
  if ((params.action === "approve" || params.action === "reject" || params.action === "reset") && ids.length) {
    const db = getDb();
    const status = params.action === "approve" ? "approved" : params.action === "reject" ? "rejected" : "uploaded";
    const assets = await selectInChunks(ids, (chunk) =>
      db
        .select({ id: schema.assets.id, projectId: schema.assets.projectId })
        .from(schema.assets)
        .where(and(eq(schema.assets.organizationId, organizationId), inArray(schema.assets.id, chunk))),
    );
    const foundIds = new Set(assets.map((a) => a.id));
    let allowed = assets;
    if (params.action === "reject") {
      const guardedRows = await selectInChunks(
        assets.map((a) => a.id),
        (chunk) =>
          db
            .select({ assetId: schema.shareGrantAssets.assetId })
            .from(schema.shareGrantAssets)
            .innerJoin(schema.shareGrants, eq(schema.shareGrants.id, schema.shareGrantAssets.grantId))
            .where(
              and(
                inArray(schema.shareGrantAssets.assetId, chunk),
                eq(schema.shareGrants.status, "active"),
                or(isNull(schema.shareGrants.expiresAt), gt(schema.shareGrants.expiresAt, new Date())),
              ),
            ),
      );
      const guarded = new Set(guardedRows.map((r) => r.assetId));
      allowed = assets.filter((a) => !guarded.has(a.id));
      if (guarded.size) {
        await insertAuditRows(db, 
          Array.from(guarded).map((assetId) => ({
            id: crypto.randomUUID(),
            organizationId,
            actorType: "user" as const,
            actorId: params.actorUserId,
            action: "asset.reject_blocked",
            targetType: "asset" as const,
            targetId: assetId,
            meta: JSON.stringify({ reason: "active_share_grant", source: "bulk" }),
          })),
        );
      }
      result.blocked.push(...Array.from(guarded).map((assetId) => ({ assetId, reason: "active client gallery" })));
    }
    if (allowed.length) {
      await forEachChunk(
        allowed.map((a) => a.id),
        (chunk) =>
          db
            .update(schema.assets)
            .set({
              status,
              // WEB-118: the retention clock starts on reject, stops otherwise.
              rejectedAt: status === "rejected" ? Math.floor(Date.now() / 1000) : null,
            })
            .where(and(eq(schema.assets.organizationId, organizationId), inArray(schema.assets.id, chunk))),
      );
    }
    result.done = allowed.length;
    result.blocked.push(...ids.filter((id) => !foundIds.has(id)).map((assetId) => ({ assetId, reason: "not found" })));
    return finishBulkAudit(organizationId, params, result, assets[0]?.projectId ?? null);
  }

  if ((params.action === "tag" || params.action === "untag") && ids.length && params.tag) {
    const db = getDb();
    const clean = params.tag.trim().toLowerCase().slice(0, MAX_TAG_LEN);
    const owned = await selectInChunks(ids, (chunk) =>
      db
        .select({ id: schema.assets.id })
        .from(schema.assets)
        .where(and(eq(schema.assets.organizationId, organizationId), inArray(schema.assets.id, chunk))),
    );
    if (owned.length) {
      if (params.action === "tag") {
        // 3 bound columns per row → 30 rows = 90 variables per statement.
        for (let i = 0; i < owned.length; i += 30) {
          await db
            .insert(schema.assetTags)
            .values(owned.slice(i, i + 30).map((a) => ({ organizationId, assetId: a.id, tag: clean })))
            .onConflictDoNothing();
        }
      } else {
        await forEachChunk(
          owned.map((a) => a.id),
          (chunk) =>
            db
              .delete(schema.assetTags)
              .where(and(eq(schema.assetTags.organizationId, organizationId), eq(schema.assetTags.tag, clean), inArray(schema.assetTags.assetId, chunk))),
        );
      }
    }
    result.done = owned.length;
    return finishBulkAudit(organizationId, params, result, undefined);
  }

  return finishBulkAudit(organizationId, params, result);
}

/** Shared bulk audit — attributes the run to the project so the activity
 * feed can surface it. Delete passes the project captured pre-deletion;
 * other actions still have their rows and resolve it here. */
async function finishBulkAudit(
  organizationId: string,
  params: { action: string; assetIds: string[]; tag?: string; actorUserId: string },
  result: BulkResult,
  projectId?: string | null,
): Promise<BulkResult> {
  if (projectId === undefined) {
    const first = await getAsset(organizationId, params.assetIds[0]);
    projectId = first?.projectId ?? null;
  }
  if (params.assetIds.length) {
    await getDb().insert(schema.auditLog).values({
      id: crypto.randomUUID(),
      organizationId,
      actorType: "user",
      actorId: params.actorUserId,
      action: `asset.bulk_${params.action}`,
      targetType: projectId ? "project" : "asset",
      targetId: projectId ?? params.assetIds[0],
      meta: JSON.stringify({ count: params.assetIds.length, done: result.done, blocked: result.blocked.length, tag: params.tag ?? null, projectId }),
    });
  }
  return result;
}

export async function getAsset(organizationId: string, assetId: string) {
  const db = getDb();
  return (
    await db
      .select()
      .from(schema.assets)
      .where(and(eq(schema.assets.id, assetId), eq(schema.assets.organizationId, organizationId)))
      .limit(1)
  )[0];
}

/* ---------------- Derivatives (WEB-116) ----------------
 * Pipeline decision (spike): Cloudflare Images/Resizing is a paid add-on and
 * Workers have no native encoder — derivatives are generated in the browser
 * at upload time (canvas) and pushed here. Canvas re-encode is EXIF-free by
 * construction (orientation baked in), so any strip policy is satisfied for
 * derivatives while originals stay untouched. RAW/HEIC have no browser
 * decoder: they simply carry no derivatives and serve originals. */

export async function attachDerivative(params: {
  organizationId: string;
  assetId: string;
  kind: "thumb" | "preview" | "preview_wm" | "edited";
  bytes: ArrayBuffer;
  contentType: string;
  /** WEB-117: enforce the studio's EXIF-strip policy — reject a derivative
   * that still carries EXIF/GPS and mark the asset's derivatives as
   * stripped once a clean one lands. */
  verifyNoExif?: boolean;
  /** WEB-242: regeneration replaces an existing preview_wm (settings
   * changes re-run the bulk path); the first write per upload stays
   * unique-guarded like thumb/preview. WEB-402: "edited" always replaces —
   * every save re-renders the look. */
  replace?: boolean;
  /** WEB-260: intrinsic size + video duration, reported by the uploader's
   * decoder — stored set-if-null (never overwrites, never rewritten). */
  width?: number;
  height?: number;
  durationMs?: number;
  /** Rainbow-sort key computed by the browser (lib/color-sort.ts). */
  colorKey?: number;
  /** WEB-401: 64-bit dHash (16 hex) — near-duplicate clustering input. */
  phash?: string;
  /** WEB-401: quality-scores JSON (validated by parseAnalysis). */
  analysis?: ImageAnalysis;
}): Promise<
  | { ok: true }
  | { ok: false; error: "not_found" | "unsupported_type" | "metadata_present" | "already_present" }
> {
  const db = getDb();
  const asset = await getAsset(params.organizationId, params.assetId);
  if (!asset) return { ok: false, error: "not_found" };
  if (!params.contentType.startsWith("image/")) return { ok: false, error: "unsupported_type" };
  if (params.verifyNoExif) {
    const { jpegExifInfo } = await import("@/lib/exif");
    if (jpegExifInfo(params.bytes).exif) return { ok: false, error: "metadata_present" };
  }

  // WEB-242: bulk regeneration may replace an existing preview_wm; a second
  // upload of the same kind is rejected (the upload pipeline races retries).
  if (params.kind === "preview_wm" && !params.replace && asset.previewWmKey) {
    return { ok: false, error: "already_present" };
  }

  // Derivatives live beside the original under the asset's own directory:
  // {org}/{project}/{asset}/{kind}.jpg
  const key = buildKey(params.organizationId, asset.projectId, asset.id, `${params.kind}.jpg`);
  await putObject(params.organizationId, `${asset.projectId}/${asset.id}/${params.kind}.jpg`, params.bytes, params.contentType);
  await db
    .update(schema.assets)
    .set({
      ...(params.kind === "thumb"
        ? { thumbKey: key }
        : params.kind === "preview"
          ? { previewKey: key }
          : params.kind === "edited"
            ? { editKey: key }
            : { previewWmKey: key }),
      ...(params.verifyNoExif ? { exifStripped: true } : {}),
      ...(params.width && !asset.width ? { width: Math.round(params.width) } : {}),
      ...(params.height && !asset.height ? { height: Math.round(params.height) } : {}),
      ...(params.durationMs && !asset.durationMs ? { durationMs: Math.round(params.durationMs) } : {}),
      ...(params.colorKey !== undefined && isValidColorKey(params.colorKey) ? { colorKey: params.colorKey } : {}),
      ...(params.phash && isValidPhash(params.phash) && !asset.phash ? { phash: params.phash } : {}),
      ...(params.analysis && !asset.analysis ? { analysis: JSON.stringify(params.analysis) } : {}),
    })
    .where(and(eq(schema.assets.id, asset.id), eq(schema.assets.organizationId, params.organizationId)));
  return { ok: true };
}

/** WEB-263: flag assets as sneak peeks (Studio+ gate at the API; the
 * flag surfaces them on the client home before the gallery opens). */
export async function setSneakPeek(params: {
  organizationId: string;
  assetIds: string[];
  on: boolean;
}): Promise<number> {
  if (!params.assetIds.length) return 0;
  const db = getDb();
  const chunks: (typeof params.assetIds)[] = [];
  for (let i = 0; i < params.assetIds.length; i += 200) chunks.push(params.assetIds.slice(i, i + 200));
  let n = 0;
  for (const chunk of chunks) {
    const rows = await db
      .update(schema.assets)
      .set({ sneakPeek: params.on })
      .where(and(eq(schema.assets.organizationId, params.organizationId), inArray(schema.assets.id, chunk)))
      .returning({ id: schema.assets.id });
    n += rows.length;
  }
  return n;
}

export async function setAssetStatus(
  organizationId: string,
  assetId: string,
  status: "approved" | "rejected" | "uploaded",
): Promise<{ ok: true } | { ok: false; error: "shared_protected" }> {
  const db = getDb();

  // Rejecting hides the file from curation — refused while an active client
  // gallery holds it (approve/reset stay allowed).
  if (status === "rejected" && (await assetProtectedByGrant(assetId))) {
    await db.insert(schema.auditLog).values({
      id: crypto.randomUUID(),
      organizationId,
      actorType: "user",
      action: "asset.reject_blocked",
      targetType: "asset",
      targetId: assetId,
      meta: JSON.stringify({ reason: "active_share_grant" }),
    });
    return { ok: false, error: "shared_protected" };
  }

  await db
    .update(schema.assets)
    .set({
      status,
      // WEB-118: the retention clock starts when the asset is rejected and
      // stops (clears) on approve/reset, so a re-reject restarts it.
      ...(status === "rejected"
        ? { rejectedAt: Math.floor(Date.now() / 1000) }
        : { rejectedAt: null }),
    })
    .where(and(eq(schema.assets.id, assetId), eq(schema.assets.organizationId, organizationId)));
  return { ok: true };
}

/* ---------------- Rejected auto-deletion (WEB-118) ---------------- */

/** Purge rejected assets past each studio's retention window. The share-grant
 * guard inside deleteAsset is the enforcement point: an asset in any active
 * client gallery is never auto-deleted (it is skipped, not failed). Every
 * purge is audited per asset. Bounded per run so one sweep can't monopolize
 * the cron. Returns the number of assets purged. */
export async function sweepRejectedRetention(maxPerOrg = 200): Promise<number> {
  const db = getDb();
  const profiles = await db
    .select({ organizationId: schema.studioProfiles.organizationId, rejectedPolicy: schema.studioProfiles.rejectedPolicy })
    .from(schema.studioProfiles)
    .limit(500);

  const now = Math.floor(Date.now() / 1000);
  let purged = 0;

  for (const profile of profiles) {
    let policy: { enabled?: boolean; retainDays?: number };
    try {
      policy = JSON.parse(profile.rejectedPolicy || "{}");
    } catch {
      continue;
    }
    if (!policy.enabled || !policy.retainDays || policy.retainDays < 1) continue;

    // Legacy rejected assets (rejected before this column existed) start
    // aging now rather than being purged instantly.
    await db
      .update(schema.assets)
      .set({ rejectedAt: now })
      .where(
        and(
          eq(schema.assets.organizationId, profile.organizationId),
          eq(schema.assets.status, "rejected"),
          isNull(schema.assets.rejectedAt),
        ),
      );

    const expired = await db
      .select({ id: schema.assets.id })
      .from(schema.assets)
      .where(
        and(
          eq(schema.assets.organizationId, profile.organizationId),
          eq(schema.assets.status, "rejected"),
          lte(schema.assets.rejectedAt, now - policy.retainDays * 86400),
        ),
      )
      .limit(maxPerOrg);

    for (const asset of expired) {
      const result = await deleteAsset(profile.organizationId, asset.id);
      if (!result.ok) continue; // shared_protected: the guard holds, skip
      await db.insert(schema.auditLog).values({
        id: crypto.randomUUID(),
        organizationId: profile.organizationId,
        actorType: "system",
        action: "asset.auto_purged",
        targetType: "asset",
        targetId: asset.id,
        meta: JSON.stringify({ reason: "rejected_retention", retainDays: policy.retainDays }),
      });
      purged++;
    }
  }
  return purged;
}

/** Bulk rename (Files polish) — pattern base + running index with zero
 * padding, applied in the given order; extensions are preserved. Order of
 * assetIds is the order the numbers run in. */
export async function bulkRenameAssets(params: {
  organizationId: string;
  assetIds: string[];
  base: string;
  start: number;
  pad: number;
  actorUserId: string;
}): Promise<{ done: number }> {
  const db = getDb();
  const ids = params.assetIds.slice(0, 500);
  let renamedProjectId: string | null = null;
  for (let i = 0; i < ids.length; i++) {
    const asset = (
      await db
        .select({ filename: schema.assets.filename, projectId: schema.assets.projectId })
        .from(schema.assets)
        .where(and(eq(schema.assets.id, ids[i]), eq(schema.assets.organizationId, params.organizationId)))
        .limit(1)
    )[0];
    if (!asset) continue;
    const ext = asset.filename.includes(".") ? asset.filename.split(".").pop()! : "";
    const name = `${params.base}${String(params.start + i).padStart(params.pad, "0")}${ext ? "." + ext : ""}`.slice(0, 160);
    renamedProjectId ??= asset.projectId;
    await db
      .update(schema.assets)
      .set({ filename: name })
      .where(and(eq(schema.assets.id, ids[i]), eq(schema.assets.organizationId, params.organizationId)));
  }
  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: params.organizationId,
    actorType: "user",
    actorId: params.actorUserId,
    action: "asset.bulk_rename",
    targetType: "project",
    targetId: renamedProjectId ?? "",
    meta: JSON.stringify({ count: ids.length, base: params.base }),
  });
  return { done: ids.length };
}

/** Manual "delete rejected now" (WEB-123) — the studio-facing counterpart
 * to the retention sweep: purge this project's rejected assets on demand.
 * Active-gallery assets are skipped and reported (same guard as delete);
 * one summary audit row covers the run. */
export async function purgeRejectedNow(params: {
  organizationId: string;
  projectId: string;
  actorUserId: string;
}): Promise<{ deleted: number; skipped: number }> {
  const db = getDb();
  const rejected = await db
    .select({ id: schema.assets.id })
    .from(schema.assets)
    .where(
      and(
        eq(schema.assets.organizationId, params.organizationId),
        eq(schema.assets.projectId, params.projectId),
        eq(schema.assets.status, "rejected"),
      ),
    );
  let deleted = 0;
  let skipped = 0;
  for (const asset of rejected) {
    if (await assetProtectedByGrant(asset.id)) {
      skipped++;
      continue;
    }
    const result = await deleteAsset(params.organizationId, asset.id);
    if (result.ok) deleted++;
    else skipped++;
  }
  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: params.organizationId,
    actorType: "user",
    actorId: params.actorUserId,
    action: "asset.rejected_purge",
    targetType: "project",
    targetId: params.projectId,
    meta: JSON.stringify({ deleted, skipped, source: "manual" }),
  });
  return { deleted, skipped };
}

/** THE authoritative protection check (WEB-127): an asset is locked while ANY
 * effectively-active grant includes it (status='active' AND not expired —
 * expiry derived live, so an expired link stops protecting immediately).
 * Every destructive path (delete, reject, future auto-delete policy and bulk
 * actions) MUST go through this, not the denormalized `shared` status. */
export async function assetProtectedByGrant(assetId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.shareGrants.id })
    .from(schema.shareGrantAssets)
    .innerJoin(schema.shareGrants, eq(schema.shareGrants.id, schema.shareGrantAssets.grantId))
    .where(
      and(
        eq(schema.shareGrantAssets.assetId, assetId),
        eq(schema.shareGrants.status, "active"),
        or(isNull(schema.shareGrants.expiresAt), gt(schema.shareGrants.expiresAt, new Date())),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Delete guarded: assets in any effectively-active grant are protected —
 * this is the single enforcement point for asset deletion (manual, bulk, or
 * auto-delete policy). Storage keys are only removed after this check. */
export async function deleteAsset(organizationId: string, assetId: string): Promise<{ ok: true } | { ok: false; error: "not_found" | "shared_protected" }> {
  const db = getDb();
  const asset = await getAsset(organizationId, assetId);
  if (!asset) return { ok: false, error: "not_found" };
  if (await assetProtectedByGrant(assetId)) {
    await db.insert(schema.auditLog).values({
      id: crypto.randomUUID(),
      organizationId,
      actorType: "user",
      action: "asset.delete_blocked",
      targetType: "asset",
      targetId: assetId,
      meta: JSON.stringify({ reason: "active_share_grant" }),
    });
    return { ok: false, error: "shared_protected" };
  }
  await db.delete(schema.assets).where(eq(schema.assets.id, assetId));
  await deleteObject(organizationId, asset.storageKey);
  // WEB-116: derivative objects live beside the original — remove them too
  // (WEB-402: including the edited look).
  if (asset.thumbKey) await deleteObject(organizationId, asset.thumbKey).catch(() => undefined);
  if (asset.previewKey) await deleteObject(organizationId, asset.previewKey).catch(() => undefined);
  if (asset.editKey) await deleteObject(organizationId, asset.editKey).catch(() => undefined);
  return { ok: true };
}

/* ---------------- Cull assist + editing (WEB-401/402) ---------------- */

/** Set (or replace) the sparse edit set on one asset. Like ratings, edits
 * are high-frequency low-risk state — no audit row. The edited derivative is
 * re-rendered by the client after this lands; clearing (null) also drops any
 * stored edit.jpg so every surface falls back to the clean preview. */
export async function setAssetEdits(
  organizationId: string,
  assetId: string,
  edits: PartialEdits | null,
): Promise<{ ok: true } | { ok: false; error: "not_found" }> {
  const db = getDb();
  const asset = await getAsset(organizationId, assetId);
  if (!asset) return { ok: false, error: "not_found" };
  const value = edits && !isEmptyEdits(edits) ? JSON.stringify(edits) : null;
  await db
    .update(schema.assets)
    .set({ edits: value, ...(value === null ? { editKey: null } : {}) })
    .where(and(eq(schema.assets.id, assetId), eq(schema.assets.organizationId, organizationId)));
  if (value === null && asset.editKey) await deleteObject(organizationId, asset.editKey).catch(() => undefined);
  return { ok: true };
}

/** Bulk paste/clear of one edit set over an id list — one uniform UPDATE per
 * chunk (same shape as bulkSetRating). Clearing also deletes the stored
 * edited derivatives (best-effort, after the row wipe). */
export async function bulkSetEdits(
  organizationId: string,
  assetIds: string[],
  edits: PartialEdits | null,
): Promise<number> {
  const db = getDb();
  const ids = assetIds.slice(0, 500);
  if (!ids.length) return 0;
  const value = edits && !isEmptyEdits(edits) ? JSON.stringify(edits) : null;

  // Clearing needs the old edit keys for R2 cleanup — read them first.
  let oldKeys: { id: string; key: string }[] = [];
  if (value === null) {
    const rows = await selectInChunks(ids, (chunk) =>
      db
        .select({ id: schema.assets.id, key: schema.assets.editKey })
        .from(schema.assets)
        .where(and(eq(schema.assets.organizationId, organizationId), inArray(schema.assets.id, chunk), isNotNull(schema.assets.editKey))),
    );
    oldKeys = rows.filter((r): r is { id: string; key: string } => Boolean(r.key));
  }

  let done = 0;
  await forEachChunk(ids, async (chunk) => {
    const res = await db
      .update(schema.assets)
      .set({ edits: value, ...(value === null ? { editKey: null } : {}) })
      .where(and(eq(schema.assets.organizationId, organizationId), inArray(schema.assets.id, chunk)))
      .returning({ id: schema.assets.id });
    done += res.length;
  });

  // Images only: pasting edits onto videos/RAWs is a no-op row-wise (they
  // can't re-render), so strip those to keep "edited" honest.
  if (value !== null) {
    await forEachChunk(ids, async (chunk) => {
      await db
        .update(schema.assets)
        .set({ edits: null })
        .where(
          and(
            eq(schema.assets.organizationId, organizationId),
            inArray(schema.assets.id, chunk),
            sql`${schema.assets.kind} != 'image'`,
          ),
        );
    });
  }

  await Promise.allSettled(oldKeys.map((r) => deleteObject(organizationId, r.key)));
  return done;
}

/** Auto-enhance a selection: per-asset deterministic edits derived from the
 * stored upload analysis (lib/edits.ts autoEdits). Assets without analysis
 * keep their existing edits. Per-row updates in ONE D1 batch — each asset's
 * correction is different by construction. Returns { done, skipped } where
 * skipped = no analysis available. The client then re-renders derivatives. */
export async function bulkAutoEnhance(
  organizationId: string,
  assetIds: string[],
): Promise<{ done: number; skipped: number }> {
  const db = getDb();
  const ids = assetIds.slice(0, 500);
  if (!ids.length) return { done: 0, skipped: 0 };

  const rows = await selectInChunks(ids, (chunk) =>
    db
      .select({ id: schema.assets.id, analysis: schema.assets.analysis, kind: schema.assets.kind })
      .from(schema.assets)
      .where(and(eq(schema.assets.organizationId, organizationId), inArray(schema.assets.id, chunk))),
  );

  const updates: { id: string; edits: string | null }[] = [];
  let skipped = 0;
  for (const row of rows) {
    if (row.kind !== "image" || !row.analysis) {
      skipped++;
      continue;
    }
    let analysis: ImageAnalysis;
    try {
      analysis = JSON.parse(row.analysis) as ImageAnalysis;
    } catch {
      skipped++;
      continue;
    }
    const edits = autoEdits(analysis);
    updates.push({ id: row.id, edits: isEmptyEdits(edits) ? null : JSON.stringify(edits) });
  }
  // Ids that didn't resolve to rows count as skipped for the UI total.
  skipped += ids.length - rows.length;

  // One CASE-based UPDATE per ~30 assets (2 vars per row + the IN list,
  // comfortably under D1's 100-variable cap) — no per-row round trips.
  let done = 0;
  for (let i = 0; i < updates.length; i += 30) {
    const chunk = updates.slice(i, i + 30);
    await db.run(
      sql`UPDATE asset SET edits = CASE id ${sql.join(
        chunk.map((u) => sql`WHEN ${u.id} THEN ${u.edits}`),
        sql` `,
      )} ELSE edits END WHERE organization_id = ${organizationId} AND id IN (${sql.join(
        chunk.map((u) => sql`${u.id}`),
        sql`, `,
      )})`,
    );
    done += chunk.length;
  }
  return { done, skipped };
}

/** Regroup near-duplicates for a project: cluster every hashed image by
 * dHash Hamming distance, wipe + rewrite group_cover (cover = sharpest
 * frame of each cluster). Called after uploads settle and from the Files
 * "Group similar" action; safe to re-run (idempotent full rewrite). */
export async function clusterProjectAssets(
  organizationId: string,
  projectId: string,
): Promise<{ groups: number; clustered: number }> {
  const db = getDb();
  const where = and(
    eq(schema.assets.organizationId, organizationId),
    eq(schema.assets.projectId, projectId),
    eq(schema.assets.kind, "image"),
    isNotNull(schema.assets.phash),
  );
  const rows = await db
    .select({ id: schema.assets.id, phash: schema.assets.phash, analysis: schema.assets.analysis })
    .from(schema.assets)
    .where(where);

  // Reset first: clusters from a previous run must not survive a re-cluster.
  await db
    .update(schema.assets)
    .set({ groupCover: null })
    .where(and(eq(schema.assets.organizationId, organizationId), eq(schema.assets.projectId, projectId), isNotNull(schema.assets.groupCover)));

  if (rows.length < 2) return { groups: 0, clustered: 0 };
  const items = rows
    .filter((r): r is { id: string; phash: string; analysis: string | null } => isValidPhash(r.phash))
    .map((r) => {
      let sharp = 50;
      try {
        sharp = r.analysis ? (JSON.parse(r.analysis) as ImageAnalysis).sharp : 50;
      } catch { /* un-analyzed rows tie at the default */ }
      return { id: r.id, phash: r.phash, sharp };
    });

  const { covers, groups, clustered } = clusterSimilar(items);
  if (!covers.size) return { groups: 0, clustered: 0 };

  // group members by cover → one UPDATE per cover (2 bound vars per member,
  // chunked under D1's variable cap by forEachChunk)
  const membersByCover = new Map<string, string[]>();
  for (const [assetId, cover] of covers) {
    const list = membersByCover.get(cover) ?? [];
    list.push(assetId);
    membersByCover.set(cover, list);
  }
  for (const [cover, members] of membersByCover) {
    await forEachChunk(members, async (chunk) => {
      await db
        .update(schema.assets)
        .set({ groupCover: cover })
        .where(and(eq(schema.assets.organizationId, organizationId), inArray(schema.assets.id, chunk)));
    });
  }
  return { groups, clustered };
}

/** Filter-menu counts for the cull-assist flags (one query, three sums) —
 * mirrors the marginal-count pattern of ratingCounts. */
export async function qualityCounts(
  organizationId: string,
  projectId: string,
): Promise<{ blurry: number; under: number; over: number; edited: number; dupes: number }> {
  const db = getDb();
  const row = (
    await db
      .select({
        blurry: sql<number>`coalesce(sum(CASE WHEN json_extract(${schema.assets.analysis}, '$.sharp') < 16 THEN 1 ELSE 0 END), 0)`,
        under: sql<number>`coalesce(sum(CASE WHEN json_extract(${schema.assets.analysis}, '$.lum') < 20 OR json_extract(${schema.assets.analysis}, '$.clipDark') > 6 THEN 1 ELSE 0 END), 0)`,
        over: sql<number>`coalesce(sum(CASE WHEN json_extract(${schema.assets.analysis}, '$.lum') > 80 OR json_extract(${schema.assets.analysis}, '$.clipBright') > 6 THEN 1 ELSE 0 END), 0)`,
        edited: sql<number>`coalesce(sum(CASE WHEN ${schema.assets.edits} IS NOT NULL THEN 1 ELSE 0 END), 0)`,
        dupes: sql<number>`coalesce(sum(CASE WHEN ${schema.assets.groupCover} IS NOT NULL THEN 1 ELSE 0 END), 0)`,
      })
      .from(schema.assets)
      .where(and(eq(schema.assets.organizationId, organizationId), eq(schema.assets.projectId, projectId)))
  )[0];
  return {
    blurry: Number(row?.blurry ?? 0),
    under: Number(row?.under ?? 0),
    over: Number(row?.over ?? 0),
    edited: Number(row?.edited ?? 0),
    dupes: Number(row?.dupes ?? 0),
  };
}

/** Near-duplicate cluster sizes for a project — coverId → member count
 * (cover included). Feeds the "×N similar" stack badges in Files. */
export async function groupSizes(organizationId: string, projectId: string): Promise<Record<string, number>> {
  const db = getDb();
  const rows = await db
    .select({ cover: schema.assets.groupCover, n: sql<number>`count(*)` })
    .from(schema.assets)
    .where(and(eq(schema.assets.organizationId, organizationId), eq(schema.assets.projectId, projectId), isNotNull(schema.assets.groupCover)))
    .groupBy(schema.assets.groupCover);
  const out: Record<string, number> = {};
  for (const r of rows) if (r.cover) out[r.cover] = Number(r.n);
  return out;
}
