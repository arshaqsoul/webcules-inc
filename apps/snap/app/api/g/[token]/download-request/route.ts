/* /api/g/{token}/download-request (WEB-261) — the client's download
 * controls + approval surface. GET returns the gallery's download controls
 * and the client's approval requests; POST files an approval request
 * (Studio+ galleries that require sign-off). Download-all itself streams
 * from /api/g/{token}/zip on every plan - nothing is queued or built. */
import { resolveGalleryAccess } from "@/lib/shares/gallery-auth";
import { assetInGrant } from "@/lib/shares/grants";
import {
  createDownloadRequest,
  downloadSettingsOf,
  listGrantDownloadRequests,
  photoDownloadCount,
} from "@/lib/repos/downloads";
import { DOWNLOAD_SCOPES, REQUEST_MAX_ASSET_IDS, type DownloadScope } from "@/lib/gallery-downloads";
import { resolveGrantByToken } from "@/lib/shares/grants";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: _t } = await params;
  const tokenGrant = await resolveGrantByToken(_t);
  if (!tokenGrant) return Response.json({ error: "unknown_gallery" }, { status: 404 });
  const access = await resolveGalleryAccess(req.headers, tokenGrant.id);
  if (!access) return Response.json({ error: "unauthorized" }, { status: 401 });
  const grant = access.grant;

  const [requests, used] = await Promise.all([listGrantDownloadRequests(grant.id, 10), photoDownloadCount(grant.id)]);
  const settings = downloadSettingsOf(grant);
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
      createdAt: r.createdAt.toISOString(),
      decidedAt: r.decidedAt,
    })),
    controls: {
      allowDownload: grant.allowDownload,
      zip: grant.allowDownload,
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
  const tokenGrant = await resolveGrantByToken(_t);
  if (!tokenGrant) return Response.json({ error: "unknown_gallery" }, { status: 404 });
  const access = await resolveGalleryAccess(req.headers, tokenGrant.id);
  if (!access) return Response.json({ error: "unauthorized" }, { status: 401 });
  const grant = access.grant;
  if (!grant.allowDownload) return Response.json({ error: "downloads_disabled" }, { status: 403 });

  // Only approval galleries file requests; everyone else streams directly.
  const settings = downloadSettingsOf(grant);
  if (!settings.approval) return Response.json({ error: "approval_not_required" }, { status: 409 });

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
    const ids = Array.isArray(body.assetIds) ? body.assetIds.slice(0, REQUEST_MAX_ASSET_IDS) : [];
    if (!ids.length) return Response.json({ error: "empty_scope" }, { status: 400 });
    for (const id of ids.slice(0, 50)) {
      if (!(await assetInGrant(grant.id, id))) return Response.json({ error: "empty_scope" }, { status: 400 });
    }
  }

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
    return Response.json({ error: result.error }, { status: result.error === "too_many_active" ? 429 : 400 });
  }
  return Response.json({ id: result.request.id, state: result.request.state, fileCount: result.request.fileCount });
}
