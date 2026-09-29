/* Cron-side download pipeline (WEB-261): build approved ZIP requests into
 * R2 (streaming, memory-bounded), email the client a one-click link, sweep
 * expired archives, and fire the 3-days-out gallery expiry reminders.
 * Never called from a request path — CPU and R2 churn live in the daily
 * cron (plus manual pings), bounded per run. */
import { and, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";

import { getDb } from "../db";
import * as schema from "../db-schema";
import { clientUrl } from "../client-urls";
import { sendEmail } from "../email";
import { buildMergeValues, renderMerge } from "../merge";
import { getStudioProfile } from "./studios";
import { getGrantById } from "../shares/grants";
import { getObject, deleteObject, buildKey } from "../storage/service";
import { R2ZipWriter, allocateZipName } from "../zip-store";
import { downloadScopeLabel, isDownloadState, parseAssetIds, type DownloadScope } from "../gallery-downloads";
import {
  getDownloadRequest,
  markDownloadState,
  markExpiryReminder,
} from "./downloads";

const ZIP_TTL_DAYS = 7;
/** Photos per build, per run — a 1k-photo request finishes in one run;
 * bigger scopes are rejected at request time (ZIP_MAX_FILES). */
const BUILD_FILE_CAP = 1000;

export type BuildSummary = { built: number; failed: number; expired: number; reminded: number };

async function requestAssetRows(request: { grantId: string; scope: string; folderName: string | null; assetIds: string | null }) {
  const db = getDb();
  const base = db
    .select({
      id: schema.assets.id,
      filename: schema.assets.filename,
      storageKey: schema.assets.storageKey,
      previewKey: schema.assets.previewKey,
      bytes: schema.assets.bytes,
      folderName: schema.shareGrantAssets.folderName,
    })
    .from(schema.shareGrantAssets)
    .innerJoin(schema.assets, eq(schema.assets.id, schema.shareGrantAssets.assetId))
    .where(and(eq(schema.shareGrantAssets.grantId, request.grantId), eq(schema.assets.kind, "image")));

  const scope = request.scope as DownloadScope;
  if (scope === "photos") {
    const wanted = new Set(parseAssetIds(request.assetIds));
    return (await base).filter((r) => wanted.has(r.id));
  }
  if (scope === "folder") {
    return (await base).filter((r) => r.folderName === request.folderName);
  }
  if (scope === "favorites") {
    const favs = await db
      .select({ assetId: schema.galleryFavorites.assetId })
      .from(schema.galleryFavorites)
      .where(eq(schema.galleryFavorites.grantId, request.grantId));
    const ids = new Set(favs.map((f) => f.assetId));
    return (await base).filter((r) => ids.has(r.id));
  }
  return base;
}

/** Build up to `max` approved requests. Failures mark the row `failed`
 * (terminal — the client can simply request again). */
export async function buildDownloadZips(max = 2): Promise<{ built: number; failed: number }> {
  const db = getDb();
  const pending = await db
    .select()
    .from(schema.downloadRequests)
    .where(eq(schema.downloadRequests.state, "approved"))
    .orderBy(schema.downloadRequests.createdAt)
    .limit(max);

  let built = 0;
  let failed = 0;
  for (const request of pending) {
    await markDownloadState(request.id, "zipping");
    try {
      const rows = (await requestAssetRows(request)).slice(0, BUILD_FILE_CAP);
      if (!rows.length) throw new Error("empty scope");

      const zipKey = buildKey(request.organizationId, "downloads", request.grantId, `${request.id}.zip`);
      const writer = await R2ZipWriter.create(zipKey);
      const taken = new Set<string>();
      let stored = 0;
      for (const row of rows) {
        // Web size = the ~2048px preview derivative with download headers —
        // zero server processing; full = original, byte-exact.
        const key = request.sizePref === "web" ? row.previewKey ?? row.storageKey : row.storageKey;
        const object = await getObject(request.organizationId, key);
        if (!object?.body) continue;
        const name = allocateZipName(taken, row.folderName, row.filename);
        await writer.addFile({ name, stream: object.body });
        stored += 1;
      }
      if (!stored) throw new Error("no readable objects");
      const finished = await writer.finish();

      const nowSec = Math.floor(Date.now() / 1000);
      await markDownloadState(request.id, "ready", {
        zipKey: finished.key,
        zipBytes: finished.bytes,
        fileCount: stored,
        builtAtSec: nowSec,
        expiresAtSec: nowSec + ZIP_TTL_DAYS * 86400,
      });
      await sendZipReadyEmail(request.id);
      built += 1;
    } catch (err) {
      console.error(`download zip build failed for ${request.id}:`, String(err));
      await markDownloadState(request.id, "failed");
      failed += 1;
    }
  }
  return { built, failed };
}

async function sendZipReadyEmail(requestId: string): Promise<void> {
  const db = getDb();
  const request = await getDb()
    .select()
    .from(schema.downloadRequests)
    .where(eq(schema.downloadRequests.id, requestId))
    .limit(1);
  const row = request[0];
  if (!row) return;
  const grant = await getGrantById(row.grantId);
  if (!grant) return;
  const [profile, galleryToken] = await Promise.all([
    getStudioProfile(grant.organizationId),
    (async () => {
      // The emailed link opens the gallery (OTP'd) with a ready-ZIP banner —
      // auth is the gallery session itself, never a raw long-lived URL.
      const enc = await db
        .select({ tokenEnc: schema.shareGrants.tokenEnc })
        .from(schema.shareGrants)
        .where(eq(schema.shareGrants.id, row.grantId))
        .limit(1);
      if (!enc[0]) return null;
      const { decryptToken } = await import("../shares/grants");
      return enc[0].tokenEnc ? decryptToken(enc[0].tokenEnc) : null;
    })(),
  ]);
  if (!profile || !galleryToken) return;
  void 0;

  const values = await buildMergeValues({ organizationId: grant.organizationId, projectId: grant.projectId, clientEmail: grant.clientEmail });
  const link = await clientUrl(grant.organizationId, `/g/${galleryToken}?zip=${row.id}`);
  const scopeLabel = downloadScopeLabel(row.scope as DownloadScope, row.folderName);
  const subject = renderMerge("Your photos are ready to download 📦", values, { surface: "plain" });
  const body = renderMerge(
    `Hi {{client_name}},\n\nYour download of ${scopeLabel} is ready — ${row.fileCount} photo${row.fileCount === 1 ? "" : "s"}. The link works for ${ZIP_TTL_DAYS} days, or until the gallery closes.\n\nOpen your gallery to download:`,
    values,
    { surface: "plain" },
  );

  await sendEmail({
    to: grant.clientEmail,
    subject,
    text: `${body}\n${link}\n\n— ${profile.studioName}`,
    html: `<p>${body.replace(/\n/g, "<br>")}</p><p><a href="${link}" style="display:inline-block;background:${"#5e6ad2"};color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open your gallery</a></p>`,
    organizationId: grant.organizationId,
    template: "gallery.zip_ready",
    refId: row.id,
  });
}

/** 3-days-out expiry reminders (once per grant). */
export async function sendExpiryReminders(): Promise<number> {
  const db = getDb();
  const nowSec = Math.floor(Date.now() / 1000);
  const untilSec = nowSec + 72 * 3600;
  const expiring = await db
    .select()
    .from(schema.shareGrants)
    .where(
      and(
        eq(schema.shareGrants.status, "active"),
        isNotNull(schema.shareGrants.expiresAt),
        isNull(schema.shareGrants.expiryRemindedAt),
        sql`${schema.shareGrants.expiresAt} > ${nowSec}`,
        sql`${schema.shareGrants.expiresAt} <= ${untilSec}`,
      ),
    )
    .limit(100);

  let sent = 0;
  for (const grant of expiring) {
    const [profile, tokenEnc] = await Promise.all([
      getStudioProfile(grant.organizationId),
      db.select({ tokenEnc: schema.shareGrants.tokenEnc }).from(schema.shareGrants).where(eq(schema.shareGrants.id, grant.id)).limit(1),
    ]);
    if (!profile || !tokenEnc[0]) continue;
    const { decryptToken } = await import("../shares/grants");
    const token = tokenEnc[0].tokenEnc ? await decryptToken(tokenEnc[0].tokenEnc) : null;
    if (!token) continue;

    const values = await buildMergeValues({ organizationId: grant.organizationId, projectId: grant.projectId, clientEmail: grant.clientEmail });
    const days = Math.max(1, Math.ceil((grant.expiresAt!.getTime() - Date.now()) / 86400_000));
    const link = await clientUrl(grant.organizationId, `/g/${token}`);
    const expires = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(grant.expiresAt!);

    await sendEmail({
      to: grant.clientEmail,
      subject: `Your gallery closes in ${days} day${days === 1 ? "" : "s"} — download your photos`,
      text: `Hi ${values.client_name},\n\nA friendly note: your gallery from ${profile.studioName} closes on ${expires}. Download your favorites before then.\n\n${link}\n\n— ${profile.studioName}`,
      html: `<p>Hi ${values.client_name},</p><p>A friendly note: your gallery from <strong>${profile.studioName}</strong> closes on <strong>${expires}</strong>. Download your favorites before then.</p><p><a href="${link}" style="display:inline-block;background:#5e6ad2;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open your gallery</a></p>`,
      organizationId: grant.organizationId,
      template: "gallery.expiring_reminder",
      refId: grant.id,
    });
    await markExpiryReminder(grant.id);
    sent += 1;
  }
  return sent;
}

/** TTL cleanup: ready→expired archives get their R2 object deleted. */
export async function sweepExpiredZips(): Promise<number> {
  const db = getDb();
  const stale = await db
    .select()
    .from(schema.downloadRequests)
    .where(and(eq(schema.downloadRequests.state, "ready"), lt(schema.downloadRequests.expiresAt, Math.floor(Date.now() / 1000))))
    .limit(50);
  for (const row of stale) {
    if (row.zipKey) {
      try {
        await deleteObject(row.organizationId, row.zipKey);
      } catch (err) {
        console.error("zip ttl delete failed:", String(err));
      }
    }
    await markDownloadState(row.id, "expired");
  }
  return stale.length;
}

/** Daily roll: everything the cron needs from this module. */
export async function downloadsDailySweep(): Promise<BuildSummary> {
  const { built, failed } = await buildDownloadZips();
  const expired = await sweepExpiredZips();
  const reminded = await sendExpiryReminders();
  return { built, failed, expired, reminded };
}

export { isDownloadState };
