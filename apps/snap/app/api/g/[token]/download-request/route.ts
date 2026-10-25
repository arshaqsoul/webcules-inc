/* /api/g/{token}/download-request (WEB-261) — the client's download
 * controls + approval surface. GET returns the gallery's download controls
 * and the client's approval requests; POST files an approval request
 * (Studio+ galleries that require sign-off). Download-all itself streams
 * from /api/g/{token}/zip on every plan - nothing is queued or built. */
import { env } from "cloudflare:workers";
import { resolveGalleryAccess } from "@/lib/shares/gallery-auth";
import { assetInGrant } from "@/lib/shares/grants";
import {
  createDownloadRequest,
  downloadSettingsOf,
  listGrantDownloadRequests,
  photoDownloadCount,
} from "@/lib/repos/downloads";
import { DOWNLOAD_SCOPES, LICENSE_TEXT_MAX, REQUEST_MAX_ASSET_IDS, licenseTextOf, parseSizePref, type DownloadScope } from "@/lib/gallery-downloads";
import { cloudDestinationsFromEnv } from "@/lib/cloud-destinations";
import { isDriveConsentHost } from "@/lib/hosts";
import { requestHost } from "@/lib/domains";
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
  // (WEB-196 review fix): proofing grants never offer the web/mid rungs —
  // the buttons only download clean unwatermarked derivatives, which the
  // WEB-242 asset route refuses anyway. Hide the ladder in the lightbox.
  const webSize = settings.webSize && !grant.proofing;
  // WEB-195: client-side cloud destinations ride the same controls — the
  // keys are public browser values (GIS client id / dropins app key); the
  // buttons stay hidden in any environment that hasn't set them.
  const cloud = cloudDestinationsFromEnv(env);
  // WEB-307 (Stark's ruling): Drive consent is refused by Google from any
  // origin not registered on the GIS client — i.e. anything but our
  // first-party hosts. Custom-hostname galleries get no Drive button
  // (it would only ever error); Dropbox works everywhere.
  if (!isDriveConsentHost(requestHost(req.headers))) cloud.driveClientId = null;
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
      webSize,
      // WEB-102: downloads are locked to the client's favorited photos.
      selectionOnly: settings.selectionOnly,
      limit: settings.limit,
      limitUsed: used,
      pin: Boolean(settings.pinHash),
      emailCapture: settings.emailCapture,
      // WEB-193: the effective license text ("" = gate off) so the lightbox
      // can render the acknowledgment dialog before replaying the download.
      license: licenseTextOf(grant).slice(0, LICENSE_TEXT_MAX) || null,
      ...cloud,
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

  // WEB-102 selection-only delivery: a request is always and only the
  // client's favorites — any wider scope is forced down (the ZIP route
  // clamps too, so a forged POST can never file an "everything" request).
  const effectiveScope: DownloadScope = settings.selectionOnly ? "favorites" : scope;

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
    scope: effectiveScope,
    folderName: effectiveScope === "folder" ? body.folderName ?? null : null,
    assetIds: effectiveScope === "photos" ? body.assetIds : undefined,
    // (WEB-196 review fix): same proofing suppression as the GET controls —
    // a proofing gallery's approval rows record sizePref "full".
    sizePref: parseSizePref(body.sizePref, settings.webSize && !grant.proofing),
    note: body.note ?? null,
    approvalRequired: settings.approval,
  });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.error === "too_many_active" ? 429 : 400 });
  }
  return Response.json({ id: result.request.id, state: result.request.state, fileCount: result.request.fileCount });
}
