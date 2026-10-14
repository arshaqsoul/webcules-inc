/* Client-upload request links (WEB-182, Integrations 5/6) — the demand-gap
 * story: tokenized upload links so wedding guests and clients can drop
 * photos into a project. Same token discipline as share grants (hash =
 * lookup key, AES-GCM enc = re-display, raw token only ever in the HTTP
 * response + email). Every guest upload lands in QUARANTINE: an ordinary
 * asset row that is deliberately absent from share_grant_assets until the
 * studio approves — structural invisibility, not a flag clients could
 * race. Approval (optionally) publishes straight into the linked client
 * gallery; rejection reuses the culling "rejected" status so the WEB-118
 * auto-delete retention clock applies unchanged. */
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { appUrl } from "@/lib/app-origin";
import { sendEmail } from "@/lib/email";
import { getStudioProfile } from "@/lib/repos/studios";
import { studioWantsEmail } from "@/lib/notify-client";
import { emitInboxItem } from "@/lib/inbox/sources";
import { bulkAssetAction } from "@/lib/repos/assets";
import {
  appendAssetsToGrant,
  decryptToken,
  encryptToken,
  grantIsEffectivelyActive,
  hashToken,
  mintToken,
  normalizeExpiry,
} from "@/lib/shares/grants";

export type UploadRequestRow = typeof schema.uploadRequests.$inferSelect;
export type UploadRequestAssetRow =
  typeof schema.uploadRequestAssets.$inferSelect;

/** Hard per-link file ceiling regardless of the studio's own max_files. */
export const REQUEST_FILE_HARD_CAP = 500;
/** Guest files cap at 1 GB — phone photos/videos, not 5 GB masters. */
export const GUEST_MAX_FILE_BYTES = 1024 * 1024 * 1024;
/** "Uploads await review" emails: at most one per link per hour. */
const NOTIFY_THROTTLE_SECONDS = 3600;

/* Guest mint/confirm per-IP rate limits (WEB-374): fixed-window counters on
 * the shared rate_limit table, same pattern as the public form presign
 * surface (forms/q/{token}/file). Generous enough for one phone batch-
 * uploading dozens of files, tight enough to stop unthrottled presign
 * farming of the public /api/u/{token}/uploads surface. Buckets are
 * purpose-prefixed so they never interact with other rate_limit consumers. */
const GUEST_RATE_WINDOW_S = 60;
export const GUEST_MINTS_PER_MIN = 60;
export const GUEST_CONFIRMS_PER_MIN = 60;

export async function checkGuestUploadRate(
  kind: "mint" | "confirm",
  ip: string,
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % GUEST_RATE_WINDOW_S);
  const key = `guest-upload:${kind}:${ip}`;
  const rows = await getDb().all<{ count: number }>(sql`
    INSERT INTO rate_limit (id, key, count, last_request) VALUES (${crypto.randomUUID()}, ${key}, 1, ${windowStart})
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN rate_limit.last_request < ${windowStart} THEN 1 ELSE rate_limit.count + 1 END,
      last_request = ${windowStart}
    RETURNING count
  `);
  return (
    (rows[0]?.count ?? 0) <=
    (kind === "mint" ? GUEST_MINTS_PER_MIN : GUEST_CONFIRMS_PER_MIN)
  );
}

const nowSec = () => Math.floor(Date.now() / 1000);

export function uploadRequestState(
  row: UploadRequestRow,
): "open" | "closed" | "expired" {
  if (row.status === "closed") return "closed";
  if (row.expiresAt && Math.floor(row.expiresAt.getTime() / 1000) <= nowSec())
    return "expired";
  return "open";
}

/** Effective file cap: the studio's pick, clamped by the hard ceiling. */
export function effectiveFileCap(
  row: Pick<UploadRequestRow, "maxFiles">,
): number {
  return row.maxFiles
    ? Math.min(row.maxFiles, REQUEST_FILE_HARD_CAP)
    : REQUEST_FILE_HARD_CAP;
}

/* ---------------- Studio-side management ---------------- */

export async function createUploadRequest(params: {
  organizationId: string;
  projectId: string;
  title: string;
  /** Optional client gallery approvals are published into. */
  grantId?: string | null;
  expiresInDays?: number | null;
  maxFiles?: number | null;
  createdById: string;
}): Promise<
  | { ok: true; id: string; token: string }
  | {
      ok: false;
      error:
        | "invalid_title"
        | "invalid_max_files"
        | "invalid_expiry"
        | "grant_mismatch";
    }
> {
  const title = params.title.trim().slice(0, 120);
  if (!title) return { ok: false, error: "invalid_title" };
  if (
    params.maxFiles != null &&
    (!Number.isInteger(params.maxFiles) ||
      params.maxFiles < 1 ||
      params.maxFiles > REQUEST_FILE_HARD_CAP)
  ) {
    return { ok: false, error: "invalid_max_files" };
  }
  const exp = normalizeExpiry(params.expiresInDays ?? null);
  if (!exp.ok) return { ok: false, error: "invalid_expiry" };

  const db = getDb();
  if (params.grantId) {
    const grant = (
      await db
        .select({
          id: schema.shareGrants.id,
          projectId: schema.shareGrants.projectId,
        })
        .from(schema.shareGrants)
        .where(
          and(
            eq(schema.shareGrants.id, params.grantId),
            eq(schema.shareGrants.organizationId, params.organizationId),
          ),
        )
        .limit(1)
    )[0];
    if (!grant || grant.projectId !== params.projectId)
      return { ok: false, error: "grant_mismatch" };
  }

  const token = mintToken();
  const id = crypto.randomUUID();
  await db.insert(schema.uploadRequests).values({
    id,
    organizationId: params.organizationId,
    projectId: params.projectId,
    grantId: params.grantId ?? null,
    title,
    tokenHash: await hashToken(token),
    tokenEnc: await encryptToken(token),
    status: "open",
    expiresAt: exp.expiresAt,
    maxFiles: params.maxFiles ?? null,
    createdBy: params.createdById,
  });
  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: params.organizationId,
    actorType: "user",
    actorId: params.createdById,
    action: "upload_request.created",
    targetType: "project",
    targetId: params.projectId,
    meta: JSON.stringify({
      uploadRequestId: id,
      grantId: params.grantId ?? null,
      maxFiles: params.maxFiles ?? null,
    }),
  });
  return { ok: true, id, token };
}

/** Close (stop accepting uploads) or reopen a link. Submissions stay
 * reviewable either way — closing never deletes quarantine rows. */
export async function setUploadRequestStatus(
  organizationId: string,
  uploadRequestId: string,
  status: "open" | "closed",
  actorUserId: string,
): Promise<boolean> {
  const db = getDb();
  const res = await db
    .update(schema.uploadRequests)
    .set({ status, closedAt: status === "closed" ? new Date() : null })
    .where(
      and(
        eq(schema.uploadRequests.id, uploadRequestId),
        eq(schema.uploadRequests.organizationId, organizationId),
      ),
    )
    .returning({ id: schema.uploadRequests.id });
  if (!res.length) return false;
  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId,
    actorType: "user",
    actorId: actorUserId,
    action:
      status === "closed" ? "upload_request.closed" : "upload_request.reopened",
    targetType: "upload_request",
    targetId: uploadRequestId,
    meta: "{}",
  });
  return true;
}

export type UploadRequestView = {
  id: string;
  title: string;
  state: "open" | "closed" | "expired";
  grantId: string | null;
  grantLive: boolean;
  expiresAt: string | null;
  maxFiles: number | null;
  uploadedCount: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  createdAt: string;
  /** Decrypted link token (for Copy link) — null when undecryptable. */
  token: string | null;
};

/** All of a project's links with decision counts + the decrypted token, for
 * the dashboard panel. */
export async function listProjectUploadRequests(
  organizationId: string,
  projectId: string,
): Promise<UploadRequestView[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.uploadRequests)
    .where(
      and(
        eq(schema.uploadRequests.organizationId, organizationId),
        eq(schema.uploadRequests.projectId, projectId),
      ),
    )
    .orderBy(desc(schema.uploadRequests.createdAt));

  const counts = await db
    .select({
      uploadRequestId: schema.uploadRequestAssets.uploadRequestId,
      status: schema.uploadRequestAssets.status,
      n: sql<number>`count(*)`,
    })
    .from(schema.uploadRequestAssets)
    .innerJoin(
      schema.uploadRequests,
      eq(schema.uploadRequests.id, schema.uploadRequestAssets.uploadRequestId),
    )
    .where(eq(schema.uploadRequests.organizationId, organizationId))
    .groupBy(
      schema.uploadRequestAssets.uploadRequestId,
      schema.uploadRequestAssets.status,
    );
  const countBy = new Map(
    counts.map((c) => [`${c.uploadRequestId}:${c.status}`, Number(c.n)]),
  );

  const grantIds = [
    ...new Set(
      rows.map((r) => r.grantId).filter((g): g is string => Boolean(g)),
    ),
  ];
  const grants = grantIds.length
    ? await db
        .select({
          id: schema.shareGrants.id,
          status: schema.shareGrants.status,
          expiresAt: schema.shareGrants.expiresAt,
        })
        .from(schema.shareGrants)
        .where(inArray(schema.shareGrants.id, grantIds))
    : [];
  const liveGrants = new Set(
    grants
      .filter((g) =>
        grantIsEffectivelyActive(
          g as Parameters<typeof grantIsEffectivelyActive>[0],
        ),
      )
      .map((g) => g.id),
  );

  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      title: r.title,
      state: uploadRequestState(r),
      grantId: r.grantId,
      grantLive: r.grantId ? liveGrants.has(r.grantId) : false,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      maxFiles: r.maxFiles,
      uploadedCount: r.uploadedCount,
      pendingCount: countBy.get(`${r.id}:pending`) ?? 0,
      approvedCount: countBy.get(`${r.id}:approved`) ?? 0,
      rejectedCount: countBy.get(`${r.id}:rejected`) ?? 0,
      createdAt: r.createdAt.toISOString(),
      token: r.tokenEnc ? await decryptToken(r.tokenEnc) : null,
    })),
  );
}

/* ---------------- Token resolution (public surface) ---------------- */

async function byTokenHash(token: string): Promise<UploadRequestRow | null> {
  return (
    (
      await getDb()
        .select()
        .from(schema.uploadRequests)
        .where(eq(schema.uploadRequests.tokenHash, await hashToken(token)))
        .limit(1)
    )[0] ?? null
  );
}

/** Resolve for UPLOADING: open + unexpired only (re-validated on every
 * request, same discipline as resolveGrantByToken). */
export async function resolveUploadRequestByToken(
  token: string,
): Promise<UploadRequestRow | null> {
  const row = await byTokenHash(token);
  return row && uploadRequestState(row) === "open" ? row : null;
}

/** Resolve for RENDERING the public page (any state — the page shows the
 * right closed/expired message instead of a bare 404). */
export async function getUploadRequestByToken(
  token: string,
): Promise<UploadRequestRow | null> {
  return byTokenHash(token);
}

/* ---------------- Guest submissions + quarantine ---------------- */

/** Record one confirmed guest upload: the quarantine row, the counter, and
 * the studio notification (inbox item per file; email throttled to one per
 * link per hour). Never throws — a notify failure must not lose the upload. */
export async function recordGuestUpload(params: {
  request: UploadRequestRow;
  assetId: string;
  uploaderName: string | null;
}): Promise<void> {
  const db = getDb();
  const name = params.uploaderName?.trim().slice(0, 80) || null;
  await db.insert(schema.uploadRequestAssets).values({
    id: crypto.randomUUID(),
    uploadRequestId: params.request.id,
    organizationId: params.request.organizationId,
    assetId: params.assetId,
    uploaderName: name,
    status: "pending",
  });

  // WEB-374 cap race: the mint route's `uploadedCount >= cap` check is
  // read-then-act, so concurrent guests could all pass it before any
  // confirm lands. This conditional increment is the atomic guard — the
  // stored counter can never exceed the cap. A confirm that loses the race
  // still keeps its quarantine row above (the bytes are already in R2 and
  // stay reviewable); only the counter stops at the cap, and the mint gate
  // then refuses further uploads. Worst case is a handful of over-cap
  // quarantine rows, bounded by the 500-file hard ceiling and plan gates.
  await db
    .update(schema.uploadRequests)
    .set({ uploadedCount: sql`${schema.uploadRequests.uploadedCount} + 1` })
    .where(
      and(
        eq(schema.uploadRequests.id, params.request.id),
        sql`${schema.uploadRequests.uploadedCount} < ${effectiveFileCap(params.request)}`,
      ),
    );

  await notifyStudioOfUpload(params.request, params.assetId, name);
}

async function notifyStudioOfUpload(
  request: UploadRequestRow,
  assetId: string,
  uploaderName: string | null,
): Promise<void> {
  try {
    const asset = (
      await getDb()
        .select({ filename: schema.assets.filename })
        .from(schema.assets)
        .where(eq(schema.assets.id, assetId))
        .limit(1)
    )[0];
    const who = uploaderName ?? "Someone";
    await emitInboxItem({
      organizationId: request.organizationId,
      kind: "gallery",
      eventType: "upload.submitted",
      entityType: "upload_request",
      entityId: request.id,
      projectId: request.projectId,
      title: `New client upload — ${request.title}`,
      preview: `${who} uploaded ${asset?.filename ?? "a file"} (awaiting your review)`,
    });

    // Email throttle: one nudge per link per hour, prefs-gated. WEB-374:
    // prefs and contact-email are checked BEFORE claiming the hourly slot —
    // a prefs-off studio (or one with no contact email) must not burn the
    // hour's slot for a send that would never go out.
    const now = nowSec();
    const last = request.lastNotifiedAt ?? 0;
    if (now - last < NOTIFY_THROTTLE_SECONDS) return;
    if (!(await studioWantsEmail(request.organizationId, "gallery"))) return;
    const profile = await getStudioProfile(request.organizationId);
    if (!profile?.contactEmail) return;
    const db = getDb();
    const claimed = (
      await db
        .update(schema.uploadRequests)
        .set({ lastNotifiedAt: now })
        .where(
          and(
            eq(schema.uploadRequests.id, request.id),
            sql`coalesce(${schema.uploadRequests.lastNotifiedAt}, 0) <= ${last}`,
          ),
        )
        .returning({ id: schema.uploadRequests.id })
    )[0];
    if (!claimed) return; // a concurrent confirm already sent this hour's email
    const link = await appUrl(
      `/dashboard/projects/${request.projectId}?tab=gallery`,
    );
    await sendEmail({
      to: profile.contactEmail,
      subject: `New photos are waiting for your review — ${request.title}`,
      text: `Photos were just uploaded through your "${request.title}" client-upload link and are waiting in quarantine.\n\nReview them: ${link}\n\nNothing is visible to the client until you approve it.\n\n— Snap`,
      html: `<p>Photos were just uploaded through your <strong>${request.title}</strong> client-upload link and are waiting in quarantine.</p><p><a href="${link}" style="display:inline-block;background:#5e6ad2;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Review uploads</a></p><p style="color:#6b6f76;font-size:13px">Nothing is visible to the client until you approve it.</p>`,
      organizationId: request.organizationId,
      template: "upload-request-pending",
      refId: request.id,
    });
  } catch (err) {
    console.error("upload-request notify failed:", String(err));
  }
}

/** Quarantine queue for one link (dashboard panel) — pending first, newest
 * first, capped so a 500-file link can't swamp the payload. */
export async function listUploadRequestAssets(
  organizationId: string,
  uploadRequestId: string,
  limit = 200,
): Promise<
  Array<
    UploadRequestAssetRow & { filename: string; kind: string; bytes: number }
  >
> {
  const rows = await getDb()
    .select({
      row: schema.uploadRequestAssets,
      filename: schema.assets.filename,
      kind: schema.assets.kind,
      bytes: schema.assets.bytes,
    })
    .from(schema.uploadRequestAssets)
    .innerJoin(
      schema.uploadRequests,
      eq(schema.uploadRequests.id, schema.uploadRequestAssets.uploadRequestId),
    )
    .innerJoin(
      schema.assets,
      eq(schema.assets.id, schema.uploadRequestAssets.assetId),
    )
    .where(
      and(
        eq(schema.uploadRequests.organizationId, organizationId),
        eq(schema.uploadRequestAssets.uploadRequestId, uploadRequestId),
      ),
    )
    .orderBy(
      schema.uploadRequestAssets.status,
      desc(schema.uploadRequestAssets.createdAt),
    )
    .limit(limit);
  return rows.map((r) => ({
    ...r.row,
    filename: r.filename,
    kind: r.kind,
    bytes: r.bytes,
  }));
}

/* ---------------- Decisions (approve / reject) ---------------- */

export type DecisionResult = {
  ok: true;
  done: number;
  published: number;
  blocked: Array<{ assetId: string; reason: string }>;
};

/** Decide quarantined uploads. Approve flips the asset to the studio
 * "approved" culling status and — when the link is bound to a LIVE client
 * gallery — appends it there (status "shared", same as a fresh delivery).
 * Reject reuses bulk rejection, active-grant guard included. Only PENDING
 * rows are decidable; anything else comes back blocked. */
export async function decideUploadRequestAssets(params: {
  organizationId: string;
  uploadRequestId: string;
  assetIds: string[];
  action: "approve" | "reject";
  actorUserId: string;
}): Promise<DecisionResult | { ok: false; error: "not_found" }> {
  const db = getDb();
  const request = (
    await db
      .select()
      .from(schema.uploadRequests)
      .where(
        and(
          eq(schema.uploadRequests.id, params.uploadRequestId),
          eq(schema.uploadRequests.organizationId, params.organizationId),
        ),
      )
      .limit(1)
  )[0];
  if (!request) return { ok: false, error: "not_found" };

  const ids = [...new Set(params.assetIds)].slice(0, REQUEST_FILE_HARD_CAP);
  const rows = ids.length
    ? await db
        .select({
          assetId: schema.uploadRequestAssets.assetId,
          status: schema.uploadRequestAssets.status,
        })
        .from(schema.uploadRequestAssets)
        .where(
          and(
            eq(
              schema.uploadRequestAssets.uploadRequestId,
              params.uploadRequestId,
            ),
            inArray(schema.uploadRequestAssets.assetId, ids),
          ),
        )
    : [];
  const byAsset = new Map(rows.map((r) => [r.assetId, r.status]));
  const blocked: Array<{ assetId: string; reason: string }> = ids
    .filter((id) => byAsset.get(id) !== "pending")
    .map((assetId) => ({
      assetId,
      reason: byAsset.has(assetId) ? "already decided" : "not found",
    }));
  const decidable = ids.filter((id) => byAsset.get(id) === "pending");
  const out: DecisionResult = { ok: true, done: 0, published: 0, blocked };
  if (!decidable.length) return out;

  const decidedAt = new Date();
  await db
    .update(schema.uploadRequestAssets)
    .set({
      status: params.action === "approve" ? "approved" : "rejected",
      decidedBy: params.actorUserId,
      decidedAt,
    })
    .where(
      and(
        eq(schema.uploadRequestAssets.uploadRequestId, params.uploadRequestId),
        inArray(schema.uploadRequestAssets.assetId, decidable),
      ),
    );

  const bulk = await bulkAssetAction(params.organizationId, {
    action: params.action,
    assetIds: decidable,
    actorUserId: params.actorUserId,
  });
  out.done = bulk.done;

  if (params.action === "approve" && request.grantId) {
    const appended = await appendAssetsToGrant(
      params.organizationId,
      request.grantId,
      decidable,
    );
    if (appended.ok && appended.added > 0) {
      // Mirrors grant creation: delivered assets carry the "shared" status
      // (the effective-active check stays authoritative).
      await db
        .update(schema.assets)
        .set({ status: "shared" })
        .where(
          and(
            eq(schema.assets.organizationId, params.organizationId),
            inArray(schema.assets.id, decidable),
          ),
        );
      out.published = appended.added;
    }
  }

  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: params.organizationId,
    actorType: "user",
    actorId: params.actorUserId,
    action: `upload_request.${params.action}`,
    targetType: "upload_request",
    targetId: params.uploadRequestId,
    meta: JSON.stringify({
      assets: decidable.length,
      published: out.published,
    }),
  });
  return out;
}
