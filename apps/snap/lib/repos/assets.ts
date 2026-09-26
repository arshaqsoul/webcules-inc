/* Asset repository — R2-backed project media. Keys are always
 * {orgId}/{projectId}/{assetId}/{filename}; every operation re-verifies the
 * org + project ownership. Status: uploaded → approved/rejected → shared. */
import { and, eq, gt, isNull, or } from "drizzle-orm";

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
