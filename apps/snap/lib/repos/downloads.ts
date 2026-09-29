/* Downloads 2.0 repository (WEB-261) — download-request lifecycle (client
 * creates → studio approves → cron zips → client downloads), per-gallery
 * settings writes, and the soft download-count check. Zip building itself
 * lives in the cron (lib/repos/downloads-build.ts) — never in a request. */
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { getDb } from "../db";
import * as schema from "../db-schema";
import {
  ACTIVE_STATES,
  parseAssetIds,
  parseDownloadSettings,
  serializeDownloadSettings,
  ZIP_MAX_FILES,
  type DownloadScope,
  type DownloadSettings,
  type DownloadState,
  type SizePref,
} from "../gallery-downloads";

export type DownloadRequestRow = typeof schema.downloadRequests.$inferSelect;
export type GrantRow = typeof schema.shareGrants.$inferSelect;

export function downloadSettingsOf(grant: { downloadSettings: string | null }): DownloadSettings {
  return parseDownloadSettings(grant.downloadSettings);
}

export async function saveDownloadSettings(organizationId: string, grantId: string, settings: DownloadSettings): Promise<boolean> {
  const updated = await getDb()
    .update(schema.shareGrants)
    .set({ downloadSettings: serializeDownloadSettings(settings) })
    .where(and(eq(schema.shareGrants.id, grantId), eq(schema.shareGrants.organizationId, organizationId)))
    .returning({ id: schema.shareGrants.id });
  return updated.length > 0;
}

export async function getDownloadRequest(organizationId: string, id: string): Promise<DownloadRequestRow | null> {
  const rows = await getDb()
    .select()
    .from(schema.downloadRequests)
    .where(and(eq(schema.downloadRequests.id, id), eq(schema.downloadRequests.organizationId, organizationId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getDownloadRequestForGrant(grantId: string, id: string): Promise<DownloadRequestRow | null> {
  const rows = await getDb()
    .select()
    .from(schema.downloadRequests)
    .where(and(eq(schema.downloadRequests.id, id), eq(schema.downloadRequests.grantId, grantId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listGrantDownloadRequests(grantId: string, limit = 10): Promise<DownloadRequestRow[]> {
  return getDb()
    .select()
    .from(schema.downloadRequests)
    .where(eq(schema.downloadRequests.grantId, grantId))
    .orderBy(desc(schema.downloadRequests.createdAt))
    .limit(limit);
}

export async function listStudioDownloadRequests(organizationId: string, states: DownloadState[], limit = 50): Promise<DownloadRequestRow[]> {
  return getDb()
    .select()
    .from(schema.downloadRequests)
    .where(and(eq(schema.downloadRequests.organizationId, organizationId), inArray(schema.downloadRequests.state, states)))
    .orderBy(desc(schema.downloadRequests.createdAt))
    .limit(limit);
}

/** Photos in the delivered set matching a request scope (WEB-216 frozen
 * folder labels; favorites = the client's hearted photos). Videos stay
 * per-photo downloads (v1 ZIPs are photos — size + format honesty). */
export async function resolveScopeAssets(params: {
  grantId: string;
  scope: DownloadScope;
  folderName?: string | null;
  assetIds?: string[];
}): Promise<{ assetIds: string[]; fileCount: number } | { error: "empty_scope" | "too_many_files" }> {
  const db = getDb();
  const photos = db
    .select({ id: schema.shareGrantAssets.assetId, folderName: schema.shareGrantAssets.folderName })
    .from(schema.shareGrantAssets)
    .innerJoin(schema.assets, eq(schema.assets.id, schema.shareGrantAssets.assetId))
    .where(and(eq(schema.shareGrantAssets.grantId, params.grantId), eq(schema.assets.kind, "image")));

  let rows: { id: string }[];
  if (params.scope === "photos") {
    const wanted = new Set((params.assetIds ?? []).slice(0, ZIP_MAX_FILES + 1));
    if (!wanted.size) return { error: "empty_scope" };
    const all = await photos;
    rows = all.filter((r) => wanted.has(r.id));
  } else if (params.scope === "folder") {
    const all = await photos;
    rows = all.filter((r) => r.folderName === params.folderName);
  } else if (params.scope === "favorites") {
    rows = await db
      .select({ id: schema.galleryFavorites.assetId })
      .from(schema.galleryFavorites)
      .where(eq(schema.galleryFavorites.grantId, params.grantId));
  } else {
    rows = await photos;
  }

  if (!rows.length) return { error: "empty_scope" };
  const ids = rows.map((r) => r.id);
  if (ids.length > ZIP_MAX_FILES) return { error: "too_many_files", fileCount: ids.length };
  return { assetIds: ids, fileCount: ids.length };
}

export type CreateRequestError = "empty_scope" | "too_many_files" | "too_many_active" | "invalid";

export async function createDownloadRequest(params: {
  grant: GrantRow;
  clientEmail: string;
  scope: DownloadScope;
  folderName?: string | null;
  assetIds?: string[];
  sizePref: SizePref;
  note?: string | null;
  /** grant's approval toggle — requested vs auto-approved. */
  approvalRequired: boolean;
}): Promise<{ ok: true; request: DownloadRequestRow } | { ok: false; error: CreateRequestError; fileCount?: number }> {
  const db = getDb();
  const active = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.downloadRequests)
    .where(and(eq(schema.downloadRequests.grantId, params.grant.id), inArray(schema.downloadRequests.state, [...ACTIVE_STATES])));
  if ((active[0]?.n ?? 0) >= 5) return { ok: false, error: "too_many_active" };

  const resolved = await resolveScopeAssets({
    grantId: params.grant.id,
    scope: params.scope,
    folderName: params.folderName,
    assetIds: params.assetIds,
  });
  if ("error" in resolved) {
    return { ok: false, error: resolved.error, fileCount: "fileCount" in resolved ? (resolved as { fileCount: number }).fileCount : undefined };
  }

  const row: typeof schema.downloadRequests.$inferInsert = {
    id: crypto.randomUUID(),
    organizationId: params.grant.organizationId,
    grantId: params.grant.id,
    clientEmail: params.clientEmail,
    scope: params.scope,
    folderName: params.scope === "folder" ? params.folderName ?? null : null,
    assetIds: params.scope === "photos" ? JSON.stringify(resolved.assetIds) : null,
    sizePref: params.sizePref,
    state: params.approvalRequired ? "requested" : "approved",
    note: params.note?.slice(0, 500) ?? null,
    fileCount: resolved.fileCount,
  };
  await db.insert(schema.downloadRequests).values(row);
  return { ok: true, request: row as DownloadRequestRow };
}

/** Studio decision on a requested ZIP (state machine enforced). */
export async function decideDownloadRequest(params: {
  organizationId: string;
  id: string;
  decision: "approve" | "reject";
  note?: string | null;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: "not_found" | "bad_state" }> {
  const db = getDb();
  const row = await getDownloadRequest(params.organizationId, params.id);
  if (!row) return { ok: false, error: "not_found" };
  if (row.state !== "requested") return { ok: false, error: "bad_state" };

  await db
    .update(schema.downloadRequests)
    .set({
      state: params.decision === "approve" ? "approved" : "rejected",
      note: params.note?.slice(0, 500) ?? row.note,
      decidedAt: Math.floor(Date.now() / 1000),
      updatedAt: new Date(),
    })
    .where(eq(schema.downloadRequests.id, params.id));

  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: params.organizationId,
    actorType: "user",
    actorId: params.actorUserId,
    action: params.decision === "approve" ? "download.request.approved" : "download.request.rejected",
    targetType: "download_request",
    targetId: params.id,
    meta: JSON.stringify({ grantId: row.grantId, scope: row.scope }),
  });
  return { ok: true };
}

/** Cron transitions. */
export async function markDownloadState(
  id: string,
  state: DownloadState,
  extra?: Partial<{ zipKey: string; zipBytes: number; fileCount: number; builtAtSec: number; expiresAtSec: number }>,
): Promise<void> {
  await getDb()
    .update(schema.downloadRequests)
    .set({
      state,
      updatedAt: new Date(),
      ...(extra?.zipKey ? { zipKey: extra.zipKey } : {}),
      ...(extra?.zipBytes ? { zipBytes: extra.zipBytes } : {}),
      ...(extra?.fileCount ? { fileCount: extra.fileCount } : {}),
      ...(extra?.builtAtSec ? { builtAt: extra.builtAtSec } : {}),
      ...(extra?.expiresAtSec ? { expiresAt: extra.expiresAtSec } : {}),
    })
    .where(eq(schema.downloadRequests.id, id));
}

/** Photos downloaded this grant (per-photo events only — ZIP fetches log
 * 'zip_download' and never consume the client's cap). */
export async function photoDownloadCount(grantId: string): Promise<number> {
  const rows = await getDb()
    .select({ n: sql<number>`count(*)` })
    .from(schema.shareAccessLogs)
    .where(and(eq(schema.shareAccessLogs.grantId, grantId), eq(schema.shareAccessLogs.event, "download")));
  return rows[0]?.n ?? 0;
}

/** The soft cap check for the asset route's download path. */
export async function downloadCapRemaining(grant: GrantRow): Promise<number | null> {
  const settings = downloadSettingsOf(grant);
  if (!settings.limit) return null;
  const used = await photoDownloadCount(grant.id);
  return settings.limit - used;
}

export async function countPendingZipBuilds(): Promise<number> {
  const rows = await getDb()
    .select({ n: sql<number>`count(*)` })
    .from(schema.downloadRequests)
    .where(eq(schema.downloadRequests.state, "approved"));
  return rows[0]?.n ?? 0;
}

/** Active grants expiring within the horizon that haven't had their
 * reminder yet (cron — the 3-days-out email). */
export async function grantsExpiringWithin(hours: number, limit = 100): Promise<GrantRow[]> {
  const nowSec = Math.floor(Date.now() / 1000);
  const untilSec = nowSec + Math.round(hours * 3600);
  return getDb()
    .select()
    .from(schema.shareGrants)
    .where(
      and(
        eq(schema.shareGrants.status, "active"),
        isNull(schema.shareGrants.expiryRemindedAt),
        isNotNull(schema.shareGrants.expiresAt),
        sql`${schema.shareGrants.expiresAt} > ${nowSec}`,
        sql`${schema.shareGrants.expiresAt} <= ${untilSec}`,
      ),
    )
    .limit(limit);
}

export async function markExpiryReminder(grantId: string): Promise<void> {
  await getDb().update(schema.shareGrants).set({ expiryRemindedAt: Math.floor(Date.now() / 1000) }).where(eq(schema.shareGrants.id, grantId));
}

export { parseAssetIds };
