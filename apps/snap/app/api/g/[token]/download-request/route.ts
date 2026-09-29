/* /api/g/{token}/download-request (WEB-261) — the client's ZIP surface:
 * GET lists their requests + download controls, POST creates one (async —
 * built by the cron). ZIPs are Lite+ (WEB-267); approval-toggled galleries
 * queue as `requested` for the studio hub. */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getPlanEntitlements } from "@/lib/plans";
import { resolveGalleryAccess } from "@/lib/shares/gallery-auth";
import { assetInGrant, getGrantById } from "@/lib/shares/grants";
import {
  createDownloadRequest,
  downloadSettingsOf,
  listGrantDownloadRequests,
  photoDownloadCount,
} from "@/lib/repos/downloads";
import { DOWNLOAD_SCOPES, isDownloadState, ZIP_MAX_FILES, type DownloadScope } from "@/lib/gallery-downloads";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: _t } = await params;
  const access = await resolveGalleryAccess(req.headers);
  if (!access) return Response.json({ error: "unauthorized" }, { status: 401 });
  const grant = access.grant;

  const [requests, ent, used] = await Promise.all([
    listGrantDownloadRequests(grant.id, 10),
    getPlanEntitlements(grant.organizationId),
    photoDownloadCount(grant.id),
  ]);
  const settings = downloadSettingsOf(grant);
  const lite = (ent?.id ?? "free") !== "free";
  return Response.json({
    requests: requests.map((r) => ({
      id: r.id,
      scope: r.scope,
      folderName: r.folderName,
      sizePref: r.sizePref,
      state: r.state,
      fileCount: r.fileCount,
      zipBytes: r.zipBytes,
      downloadCount: r.downloadCount,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt.toISOString(),
      decidedAt: r.decidedAt,
      builtAt: r.builtAt,
    })),
    controls: {
      allowDownload: grant.allowDownload,
      zip: lite && grant.allowDownload,
      approval: settings.approval,
      webSize: settings.webSize,
      limit: settings.limit,
      limitUsed: used,
      pin: Boolean(settings.pinHash),
    },
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: _t } = await params;
  const access = await resolveGalleryAccess(req.headers);
  if (!access) return Response.json({ error: "unauthorized" }, { status: 401 });
  const grant = access.grant;
  if (!grant.allowDownload) return Response.json({ error: "downloads_disabled" }, { status: 403 });

  const ent = await getPlanEntitlements(grant.organizationId);
  if ((ent?.id ?? "free") === "free") return Response.json({ error: "zip_requires_lite" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    scope?: string;
    folderName?: string | null;
    assetIds?: string[];
    sizePref?: string;
    note?: string;
  };
  const scope = (DOWNLOAD_SCOPES as readonly string[]).includes(String(body.scope)) ? (body.scope as DownloadScope) : null;
  if (!scope) return Response.json({ error: "invalid_scope" }, { status: 400 });

  // scope='photos' ids must be in this grant; folder must exist in it.
  if (scope === "photos") {
    const ids = Array.isArray(body.assetIds) ? body.assetIds.slice(0, ZIP_MAX_FILES + 1) : [];
    if (!ids.length) return Response.json({ error: "empty_scope" }, { status: 400 });
    for (const id of ids.slice(0, 50)) {
      if (!(await assetInGrant(grant.id, id))) return Response.json({ error: "empty_scope" }, { status: 400 });
    }
  }

  const settings = downloadSettingsOf(grant);
  const result = await createDownloadRequest({
    grant,
    clientEmail: grant.clientEmail,
    scope,
    folderName: scope === "folder" ? body.folderName ?? null : null,
    assetIds: scope === "photos" ? body.assetIds : undefined,
    sizePref: settings.webSize && body.sizePref === "web" ? "web" : "full",
    note: body.note ?? null,
    approvalRequired: settings.approval,
  });
  if (!result.ok) {
    const status = result.error === "too_many_active" ? 429 : 400;
    return Response.json({ error: result.error, ...(result.fileCount ? { fileCount: result.fileCount } : {}) }, { status });
  }
  return Response.json({ id: result.request.id, state: result.request.state, fileCount: result.request.fileCount });
}
