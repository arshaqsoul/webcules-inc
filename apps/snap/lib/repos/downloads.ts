/* Downloads repository (WEB-261) — the approval lifecycle for download-all
 * (client requests → studio approves → client streams), per-gallery
 * settings writes, and the soft download-count check. Archives are never
 * built ahead of time: lib/zip-delivery.ts streams them on demand. */
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { getDb } from "../db";
import * as schema from "../db-schema";
import { deleteObject } from "../storage/service";
import { buildZipPlan } from "../zip-delivery";
import {
  ACTIVE_STATES,
  REQUEST_MAX_ASSET_IDS,
  canTransition,
  parseDownloadSettings,
  serializeDownloadSettings,
  type DownloadScope,
  type DownloadSettings,
  type SizePref,
} from "../gallery-downloads";

export type DownloadRequestRow = typeof schema.downloadRequests.$inferSelect;
export type GrantRow = typeof schema.shareGrants.$inferSelect;

/** Pending requests one grant may hold at once. */
const MAX_PENDING_REQUESTS = 5;

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

export type CreateRequestError = "empty_scope" | "too_many_active";

/** File an approval request. Only galleries that require studio approval
 * create rows - everyone else streams straight away with no request. */
export async function createDownloadRequest(params: {
  grant: GrantRow;
  clientEmail: string;
  scope: DownloadScope;
  folderName?: string | null;
  assetIds?: string[];
  sizePref: SizePref;
  note?: string | null;
  /** grant's approval toggle - requested vs auto-approved. */
  approvalRequired: boolean;
}): Promise<{ ok: true; request: DownloadRequestRow } | { ok: false; error: CreateRequestError }> {
  const db = getDb();
  const pending = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.downloadRequests)
    .where(and(eq(schema.downloadRequests.grantId, params.grant.id), inArray(schema.downloadRequests.state, [...ACTIVE_STATES])));
  if ((pending[0]?.n ?? 0) >= MAX_PENDING_REQUESTS) return { ok: false, error: "too_many_active" };

  const assetIds = params.scope === "photos" ? (params.assetIds ?? []).slice(0, REQUEST_MAX_ASSET_IDS) : undefined;
  const plan = await buildZipPlan({
    organizationId: params.grant.organizationId,
    grantId: params.grant.id,
    proofing: params.grant.proofing,
    selection: { scope: params.scope, folderName: params.folderName, assetIds, size: params.sizePref },
  });
  if (!plan.items.length) return { ok: false, error: "empty_scope" };

  const row: typeof schema.downloadRequests.$inferInsert = {
    id: crypto.randomUUID(),
    organizationId: params.grant.organizationId,
    grantId: params.grant.id,
    clientEmail: params.clientEmail,
    scope: params.scope,
    folderName: params.scope === "folder" ? params.folderName ?? null : null,
    assetIds: assetIds ? JSON.stringify(assetIds) : null,
    sizePref: params.sizePref,
    state: params.approvalRequired ? "requested" : "approved",
    note: params.note?.slice(0, 500) ?? null,
    fileCount: plan.items.length,
    zipBytes: plan.totalBytes,
  };
  await db.insert(schema.downloadRequests).values(row);
  return { ok: true, request: row as DownloadRequestRow };
}

/** Studio decision on a requested download (state machine enforced). */
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

/** A client started pulling an approved request: count it, and flip
 * approved → delivered on the first part (later parts and re-downloads keep
 * working while the gallery is live). */
export async function recordRequestDelivery(row: DownloadRequestRow): Promise<void> {
  const next = row.state === "approved" && canTransition("approved", "delivered") ? "delivered" : row.state;
  await getDb()
    .update(schema.downloadRequests)
    .set({ state: next, downloadCount: sql`${schema.downloadRequests.downloadCount} + 1`, updatedAt: new Date() })
    .where(eq(schema.downloadRequests.id, row.id));
}

/** Photos downloaded this grant (per-photo events only — ZIP parts log
 * 'zip_download' and never consume the client's cap). */
export async function photoDownloadCount(grantId: string): Promise<number> {
  const rows = await getDb()
    .select({ n: sql<number>`count(*)` })
    .from(schema.shareAccessLogs)
    .where(and(eq(schema.shareAccessLogs.grantId, grantId), eq(schema.shareAccessLogs.event, "download")));
  return rows[0]?.n ?? 0;
}

/** ZIP parts this grant started since `sinceMs` - the abuse ceiling that
 * replaces the old "5 queued builds" cap. */
export async function zipPartsStartedSince(grantId: string, sinceMs: number): Promise<number> {
  const rows = await getDb()
    .select({ n: sql<number>`count(*)` })
    .from(schema.shareAccessLogs)
    .where(
      and(
        eq(schema.shareAccessLogs.grantId, grantId),
        eq(schema.shareAccessLogs.event, "zip_download"),
        sql`${schema.shareAccessLogs.createdAt} >= ${Math.floor(sinceMs / 1000)}`,
      ),
    );
  return rows[0]?.n ?? 0;
}

/** One-time cleanup of archives the retired cron pipeline left in R2 (rows
 * from before downloads 3.0 still carry a zip_key). Bounded per run; once it
 * reports 0 everywhere this function and the zip_key column can be dropped. */
export async function purgeLegacyZips(limit = 50): Promise<number> {
  const db = getDb();
  const stale = await db
    .select({ id: schema.downloadRequests.id, organizationId: schema.downloadRequests.organizationId, zipKey: schema.downloadRequests.zipKey })
    .from(schema.downloadRequests)
    .where(isNotNull(schema.downloadRequests.zipKey))
    .limit(limit);
  for (const row of stale) {
    try {
      if (row.zipKey) await deleteObject(row.organizationId, row.zipKey);
      await db.update(schema.downloadRequests).set({ zipKey: null }).where(eq(schema.downloadRequests.id, row.id));
    } catch (err) {
      console.error("legacy zip purge failed:", String(err));
    }
  }
  return stale.length;
}
