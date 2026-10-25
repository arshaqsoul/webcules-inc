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

/** WEB-102 selection-only delivery: is this asset among the grant's client
 * favorites? Any favorite list counts — the client hearts a photo, it's
 * downloadable when the studio turns selection-only on. */
export async function assetFavorited(grantId: string, assetId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ assetId: schema.galleryFavorites.assetId })
    .from(schema.galleryFavorites)
    .where(and(eq(schema.galleryFavorites.grantId, grantId), eq(schema.galleryFavorites.assetId, assetId)))
    .limit(1);
  return rows.length > 0;
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

/* ---------------- WEB-194: email-capture gate ---------------- */

/** Abuse ceiling on the capture endpoint: submissions per grant per hour.
 * A real guest types their address once or twice; a script hits this. */
export const MAX_EMAIL_CAPTURES_PER_HOUR = 20;

export async function emailCapturesSince(grantId: string, sinceMs: number): Promise<number> {
  const rows = await getDb()
    .select({ n: sql<number>`count(*)` })
    .from(schema.downloadEmailCaptures)
    .where(
      and(
        eq(schema.downloadEmailCaptures.grantId, grantId),
        sql`${schema.downloadEmailCaptures.createdAt} >= ${Math.floor(sinceMs / 1000)}`,
      ),
    );
  return rows[0]?.n ?? 0;
}

export async function recordEmailCapture(params: { grantId: string; email: string; req?: Request }): Promise<void> {
  await getDb().insert(schema.downloadEmailCaptures).values({
    id: crypto.randomUUID(),
    grantId: params.grantId,
    email: params.email,
    ip: params.req?.headers.get("cf-connecting-ip") ?? null,
    userAgent: params.req?.headers.get("user-agent")?.slice(0, 250) ?? null,
    createdAt: new Date(),
  });
}

/* ---------------- WEB-193: license-acknowledgment gate ---------------- */

/** Abuse ceiling on the ack endpoint: agreements per grant per hour (the
 * cookie short-circuits repeats; only fresh visitors/edits hit the table). */
export const MAX_LICENSE_ACKS_PER_HOUR = 30;

/** SHA-256 hex of the license text — the version stamp the ack cookie and
 * the frozen audit rows are bound to. */
export async function licenseSha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Save the per-gallery license text (already sanitized; null clears the
 * gate). All tiers — this is legal cover, never a feature gate. */
export async function saveLicenseText(organizationId: string, grantId: string, text: string | null): Promise<boolean> {
  const updated = await getDb()
    .update(schema.shareGrants)
    .set({ licenseText: text })
    .where(and(eq(schema.shareGrants.id, grantId), eq(schema.shareGrants.organizationId, organizationId)))
    .returning({ id: schema.shareGrants.id });
  return updated.length > 0;
}

/** AUDIT-FROZEN agreement: append-only, freezing the exact text + SHA the
 * visitor acknowledged. No update/delete path exists — editing the gallery's
 * license text only adds new rows. */
export async function recordLicenseAck(params: {
  grantId: string;
  licenseSha: string;
  licenseText: string;
  req?: Request;
}): Promise<void> {
  await getDb().insert(schema.downloadLicenseAcks).values({
    id: crypto.randomUUID(),
    grantId: params.grantId,
    licenseSha256: params.licenseSha,
    licenseText: params.licenseText,
    ip: params.req?.headers.get("cf-connecting-ip") ?? null,
    userAgent: params.req?.headers.get("user-agent")?.slice(0, 250) ?? null,
    createdAt: new Date(),
  });
}

export async function licenseAcksSince(grantId: string, sinceMs: number): Promise<number> {
  const rows = await getDb()
    .select({ n: sql<number>`count(*)` })
    .from(schema.downloadLicenseAcks)
    .where(
      and(
        eq(schema.downloadLicenseAcks.grantId, grantId),
        sql`${schema.downloadLicenseAcks.createdAt} >= ${Math.floor(sinceMs / 1000)}`,
      ),
    );
  return rows[0]?.n ?? 0;
}

export type LicenseAck = { licenseSha256: string; createdAt: string; ip: string | null };

/** The studio's acknowledgment ledger (audit view), most recent first. */
export async function listLicenseAcks(grantId: string, limit = 50): Promise<LicenseAck[]> {
  const rows = await getDb()
    .select({
      licenseSha256: schema.downloadLicenseAcks.licenseSha256,
      createdAt: schema.downloadLicenseAcks.createdAt,
      ip: schema.downloadLicenseAcks.ip,
    })
    .from(schema.downloadLicenseAcks)
    .where(eq(schema.downloadLicenseAcks.grantId, grantId))
    .orderBy(desc(schema.downloadLicenseAcks.createdAt))
    .limit(limit);
  return rows.map((r) => ({ licenseSha256: r.licenseSha256, createdAt: r.createdAt.toISOString(), ip: r.ip }));
}

export type CapturedEmail = { email: string; count: number; lastAt: string };

/** The studio's who-took-files list: distinct emails, most recent first. */
export async function listCapturedEmails(grantId: string, limit = 20): Promise<CapturedEmail[]> {
  const rows = await getDb()
    .select({
      email: schema.downloadEmailCaptures.email,
      count: sql<number>`count(*)`,
      lastAt: sql<number>`max(${schema.downloadEmailCaptures.createdAt})`,
    })
    .from(schema.downloadEmailCaptures)
    .where(eq(schema.downloadEmailCaptures.grantId, grantId))
    .groupBy(schema.downloadEmailCaptures.email)
    .orderBy(desc(sql`max(${schema.downloadEmailCaptures.createdAt})`))
    .limit(limit);
  return rows.map((r) => ({ email: r.email, count: r.count, lastAt: new Date(Number(r.lastAt) * 1000).toISOString() }));
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
