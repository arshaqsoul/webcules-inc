/* Authorized media proxy — every byte served passes an access check.
 * Staff path: org-scoped via better-auth session. Gallery path: the snap-g
 * OTP cookie (grant-scoped, 30d) + live grant re-check + asset ∈ grant set.
 * Streams from R2 with Range support (video scrubbing) and
 * inline/attachment modes; gallery downloads respect the grant's policy. */
import { getObject } from "@/lib/storage/service";
import { deleteAsset, getAsset, setAssetRating, setAssetStatus } from "@/lib/repos/assets";
import { stripJpegExif } from "@/lib/exif";
import { getOrgContext } from "@/lib/session";
import { clientIp, logShareAccess, resolveGalleryAccess } from "@/lib/shares/gallery-auth";
import { assetInGrant, getGrantById } from "@/lib/shares/grants";
import { checkImageView } from "@/lib/limits";
import { downloadSettingsOf, photoDownloadCount } from "@/lib/repos/downloads";
import { downloadCookieOk } from "@/app/api/g/[token]/download-request/verify/route";

export const dynamic = "force-dynamic";

type ServableAsset = {
  id: string;
  organizationId: string;
  storageKey: string;
  filename: string;
  mimeType: string;
};

/** WEB-116/242: ?variant=thumb|preview|preview_wm swaps in the stored
 * derivative key, falling back sensibly when none exists (pre-derivative
 * assets, RAW/HEIC that the browser can't decode, wm variant not yet
 * regenerated → clean preview — transitional, never a broken image). */
function variantKey(
  asset: { thumbKey: string | null; previewKey: string | null; previewWmKey: string | null },
  variant: string | null,
): string | null {
  if (variant === "thumb" && asset.thumbKey) return asset.thumbKey;
  if (variant === "preview" && asset.previewKey) return asset.previewKey;
  if (variant === "preview_wm") return asset.previewWmKey ?? asset.previewKey;
  return null;
}

/** Shared R2 streaming with Range + disposition (used by both paths). */
async function serveAsset(req: Request, asset: ServableAsset, allowDownload: boolean): Promise<Response> {
  const object = await getObject(asset.organizationId, asset.storageKey);
  if (!object) return Response.json({ error: "not_found" }, { status: 404 });

  const url = new URL(req.url);
  const disposition =
    url.searchParams.get("download") === "1" && allowDownload ? "attachment" : "inline";
  const filename = encodeURIComponent(asset.filename);

  const headers = new Headers({
    "Content-Type": object.httpMetadata?.contentType ?? asset.mimeType,
    "Cache-Control": "private, max-age=60",
    "Content-Disposition": `${disposition}; filename*=UTF-8''${filename}`,
    "Accept-Ranges": "bytes",
  });

  // Range support (video scrubbing) — R2 native range read.
  const range = req.headers.get("Range");
  if (range && object.size) {
    const match = range.match(/bytes=(\d*)-(\d*)/);
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), object.size - 1) : object.size - 1;
      if (start <= end && start < object.size) {
        const slice = await getObject(asset.organizationId, asset.storageKey, {
          offset: start,
          length: end - start + 1,
        });
        if (slice) {
          return new Response(slice.body, {
            status: 206,
            headers: {
              ...headers,
              "Content-Range": `bytes ${start}-${end}/${object.size}`,
              "Content-Length": String(end - start + 1),
            },
          });
        }
      }
    }
  }

  return new Response(object.body, { headers });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const wantsDownload = url.searchParams.get("download") === "1";

  // Staff path — org-scoped session.
  const ctx = await getOrgContext();
  if (ctx) {
    const asset = await getAsset(ctx.organizationId, id);
    if (!asset) return Response.json({ error: "not_found" }, { status: 404 });
    const dk = variantKey(asset, url.searchParams.get("variant"));
    return serveAsset(req, dk ? { ...asset, storageKey: dk, mimeType: "image/jpeg" } : asset, true);
  }

  // Gallery path — snap-g cookie, live grant check, asset ∈ grant set.
  const access = await resolveGalleryAccess(req.headers);
  if (access) {
    const inSet = await assetInGrant(access.grant.id, id);
    if (!inSet) return Response.json({ error: "not_found" }, { status: 404 });
    const grant = await getGrantById(access.grant.id); // fresh row for expiry/policy
    const asset = await getAsset(access.grant.organizationId, id);
    if (!asset || !grant) return Response.json({ error: "not_found" }, { status: 404 });

    // WEB-160: per-IP 30 views/min + per-gallery monthly budget. Range
    // requests (video scrubbing) continue an already-admitted view.
    const ip = clientIp(req);
    const rangeReq = req.headers.has("Range");
    if (ip && !rangeReq) {
      const limit = await checkImageView(ip, grant.organizationId, grant.id);
      if (!limit.ok) {
        return Response.json(
          { error: limit.reason === "ip" ? "rate_limited" : "view_budget_exceeded" },
          { status: 429, headers: { "Retry-After": String(limit.retryAfterS) } },
        );
      }
    }

    if (wantsDownload && grant.allowDownload) {
      // WEB-261: download PIN (remembered per client via the snap-dl cookie
      // minted by the verify route) + the soft per-client cap.
      const settings = downloadSettingsOf(grant);
      if (settings.pinHash && !(await downloadCookieOk(grant.id, req.headers.get("cookie")?.match(/(?:^|;\s*)snap-dl=([^;]+)/)?.[1] ?? null))) {
        return Response.json({ error: "pin_required" }, { status: 401 });
      }
      if (settings.limit && (await photoDownloadCount(grant.id)) >= settings.limit) {
        return Response.json({ error: "download_limit_reached", limit: settings.limit }, { status: 403 });
      }
      await logShareAccess(grant.id, "download", req);
    }
    const dk = variantKey(asset, url.searchParams.get("variant"));

    // WEB-261: web-size download = the ~2048px preview derivative with
    // download headers (zero server processing; derivative is clean by
    // construction, so the EXIF strip below never applies).
    if (wantsDownload && grant.allowDownload && url.searchParams.get("size") === "web" && asset.previewKey) {
      return serveAsset(
        req,
        { ...asset, storageKey: asset.previewKey, mimeType: "image/jpeg" },
        true,
      );
    }

    // WEB-242 proofing mode: downloads deliver the watermarked preview
    // (pre-sale delivery) — original bytes never leave in proofing grants.
    if (wantsDownload && grant.allowDownload && grant.proofing) {
      const wmKey = asset.previewWmKey ?? asset.previewKey;
      if (wmKey) {
        return serveAsset(
          req,
          { ...asset, storageKey: wmKey, mimeType: "image/jpeg", filename: asset.filename },
          true,
        );
      }
    }

    // WEB-172: original JPEG downloads from a client gallery are delivered
    // EXIF/GPS-free. Derivatives are metadata-free by construction; staff
    // downloads keep the photographer's originals untouched.
    if (wantsDownload && grant.allowDownload && !dk && asset.mimeType === "image/jpeg") {
      const object = await getObject(asset.organizationId, asset.storageKey);
      if (object) {
        const bytes = await new Response(object.body).arrayBuffer();
        const stripped = stripJpegExif(bytes);
        const filename = encodeURIComponent(asset.filename);
        const headers = new Headers({
          "Content-Type": object.httpMetadata?.contentType ?? asset.mimeType,
          "Cache-Control": "private, max-age=60",
          "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
        });
        if (stripped) {
          headers.set("Content-Length", String(stripped.byteLength));
          headers.set("X-Snap-Exif", "stripped");
          return new Response(stripped.buffer as ArrayBuffer, { headers });
        }
        headers.set("Content-Length", String(bytes.byteLength));
        return new Response(bytes, { headers });
      }
    }

    return serveAsset(req, dk ? { ...asset, storageKey: dk, mimeType: "image/jpeg" } : asset, grant.allowDownload);
  }

  return Response.json({ error: "unauthorized" }, { status: 401 });
}

/** Approve / reject / reset an asset's status. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  let body: { action?: string; value?: number };
  try {
    body = (await req.json()) as { action?: string; value?: number };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const validValue = Number.isInteger(body.value) && (body.value as number) >= 0 && (body.value as number) <= 5;
  if (body.action === "stars" || body.action === "color") {
    if (!validValue) return Response.json({ error: "invalid_value" }, { status: 400 });
    const r = await setAssetRating(ctx.organizationId, id, { [body.action]: body.value });
    if (!r.ok) return Response.json({ error: r.error }, { status: 404 });
    return Response.json({ ok: true, [body.action]: body.value });
  }
  if (body.action !== "approve" && body.action !== "reject" && body.action !== "reset") {
    return Response.json({ error: "invalid_action" }, { status: 400 });
  }
  const status = body.action === "approve" ? "approved" : body.action === "reject" ? "rejected" : "uploaded";
  const result = await setAssetStatus(ctx.organizationId, id, status);
  if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
  return Response.json({ ok: true, status });
}

/** Delete an asset (R2 + row). Shared assets are protected. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const result = await deleteAsset(ctx.organizationId, id);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 409;
    return Response.json({ error: result.error }, { status });
  }
  return Response.json({ ok: true });
}
