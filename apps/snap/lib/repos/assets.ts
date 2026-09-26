/* Asset repository — R2-backed project media. Keys are always
 * {orgId}/{projectId}/{assetId}/{filename}; every operation re-verifies the
 * org + project ownership. Status: uploaded → approved/rejected → shared. */
import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { buildKey, deleteObject, putObject } from "@/lib/storage/service";

export const ASKINDS = ["image", "video", "raw", "other"] as const;

const EXT_KIND: Record<string, (typeof ASKINDS)[number]> = {
  jpg: "image", jpeg: "image", png: "image", webp: "image", avif: "image", heic: "image", gif: "image",
  mp4: "video", mov: "video", webm: "video",
  cr2: "raw", cr3: "raw", nef: "raw", arw: "raw", dng: "raw", rwl: "raw",
};

const ALLOWED_EXTENSIONS = new Set(Object.keys(EXT_KIND));

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
  const tagRows = await db
    .select()
    .from(schema.assetTags)
    .where(inArray(schema.assetTags.assetId, rows.map((r) => r.id)));
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
  for (const assetId of params.assetIds.slice(0, 500)) {
    if (params.action === "delete") {
      const r = await deleteAsset(organizationId, assetId);
      if (r.ok) result.done++;
      else if (r.error === "shared_protected") result.blocked.push({ assetId, reason: "active client gallery" });
      else result.blocked.push({ assetId, reason: "not found" });
      continue;
    }
    if (params.action === "reject") {
      const r = await setAssetStatus(organizationId, assetId, "rejected");
      if (r.ok) result.done++;
      else result.blocked.push({ assetId, reason: "active client gallery" });
      continue;
    }
    if (params.action === "tag" || params.action === "untag") {
      if (!params.tag) continue;
      await setAssetTag(organizationId, assetId, params.tag, params.action === "tag");
      result.done++;
      continue;
    }
    const status = params.action === "approve" ? "approved" : "uploaded";
    await setAssetStatus(organizationId, assetId, status);
    result.done++;
  }
  if (params.assetIds.length) {
    await getDb().insert(schema.auditLog).values({
      id: crypto.randomUUID(),
      organizationId,
      actorType: "user",
      actorId: params.actorUserId,
      action: `asset.bulk_${params.action}`,
      targetType: "project",
      targetId: params.assetIds[0],
      meta: JSON.stringify({ count: params.assetIds.length, done: result.done, blocked: result.blocked.length, tag: params.tag ?? null }),
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
    .set({ status })
    .where(and(eq(schema.assets.id, assetId), eq(schema.assets.organizationId, organizationId)));
  return { ok: true };
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
  return { ok: true };
}
