/* Authorized media proxy — every byte served passes an access check.
 * Staff path: org-scoped via better-auth session. Gallery path: the snap-g
 * OTP cookie (grant-scoped, 30d) + live grant re-check + asset ∈ grant set.
 * Streams from R2 with Range support (video scrubbing) and
 * inline/attachment modes; gallery downloads respect the grant's policy. */
import { getObject } from "@/lib/storage/service";
import { deleteAsset, getAsset, setAssetEdits, setAssetRating, setAssetStatus } from "@/lib/repos/assets";
import { firstValidOrgKey, variantServeKey } from "@/lib/assets-serving";
import { normalizeEditSet } from "@/lib/edits";
import { stripJpegExif } from "@/lib/exif";
import { getOrgContext } from "@/lib/session";
import { clientIp, logShareAccess, resolveGalleryAccess } from "@/lib/shares/gallery-auth";
import { assetInGrant, getGrantById } from "@/lib/shares/grants";
import { checkImageView, countAssetView, viewLimiterApplies } from "@/lib/limits";
import { downloadSettingsOf, assetFavorited, photoDownloadCount, licenseSha256 } from "@/lib/repos/downloads";
import { licenseTextOf } from "@/lib/gallery-downloads";
import { licenseAckCookieOk } from "@/app/api/g/[token]/download-request/license/route";
import { emailCaptureCookieOk } from "@/app/api/g/[token]/download-request/email/route";
import { downloadCookieOk } from "@/app/api/g/[token]/download-request/verify/route";

export const dynamic = "force-dynamic";

type ServableAsset = {
  id: string;
  organizationId: string;
  storageKey: string;
  filename: string;
  mimeType: string;
};

/** WEB-116/242: ?variant=thumb|preview|preview_wm|edited swaps in the stored
 * derivative key, falling back sensibly when none exists (pre-derivative
 * assets, RAW/HEIC that the browser can't decode, wm variant not yet
 * regenerated → clean preview — transitional, never a broken image).
 * WEB-402: when the asset has an edited look (edit.jpg), thumb/preview serve
 * it — the grade is the deliverable; originals stay untouched (staff "Open
 * original" and full-res delivery still stream the original bytes).
 * WEB-440: selection lives in lib/assets-serving.ts — every rung is
 * org-prefix-validated so a malformed stored key degrades down the ladder
 * instead of throwing a 500 (the edit_key asset 500s + &r= retry storm). */

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
    const dk = variantServeKey(asset, url.searchParams.get("variant"));
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
    // WEB-443: grid thumbs (variant=thumb, not a download) are exempt —
    // a gallery page loads every thumb at once, so the 30/min cap 429'd
    // everything past photo 30 and drove the &r= cache-busting retry
    // storm. Thumb view counts are batched per page load instead (see
    // countGalleryAssetViews in the gallery page); the monthly budget
    // still gates thumbs at the page level (countGalleryOpen).
    const ip = clientIp(req);
    // (audit fix): only CONTINUATION ranges (start > 0, video scrubbing)
    // skip the budget — a client sending `Range: bytes=0-` on every GET used
    // to bypass per-IP and monthly view counting entirely.
    const rangeHeader = req.headers.get("Range");
    const rangeStart = rangeHeader ? Number(rangeHeader.match(/bytes=(\d*)-/)?.[1] || 0) : null;
    const continuation = rangeStart !== null && rangeStart > 0;
    if (ip && !continuation && viewLimiterApplies(url.searchParams.get("variant"), wantsDownload)) {
      const limit = await checkImageView(ip, grant.organizationId, grant.id);
      // WEB-265: per-photo interest counter (heat overlay) — only admitted
      // views count, same moment as the budget.
      await countAssetView(grant.organizationId, grant.id, id);
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
      // WEB-194: email-capture gate — same remembered-per-client cookie
      // pattern as the PIN (minted by the email route). Both gates apply.
      if (settings.emailCapture && !(await emailCaptureCookieOk(grant.id, req.headers.get("cookie")?.match(/(?:^|;\s*)snap-dl-email=([^;]+)/)?.[1] ?? null))) {
        return Response.json({ error: "email_required" }, { status: 401 });
      }
      // WEB-102 selection-only delivery: when the grant locks downloads to
      // the client's favorites, any non-favorited asset 403s — on every
      // rung (original/web/mid), full quality included. Favorited assets
      // deliver exactly as before; the approval flow doesn't bypass this
      // (approved ZIP pulls are scoped separately on the zip route).
      if (settings.selectionOnly && !(await assetFavorited(grant.id, id))) {
        return Response.json({ error: "selection_only" }, { status: 403 });
      }
      // WEB-193: license acknowledgment — the studio's legal cover on free
      // downloads, ALL tiers (never a feature gate). The ack cookie is bound
      // to the text version, so editing the license re-locks the gallery.
      const license = licenseTextOf(grant);
      if (license) {
        const licenseSha = await licenseSha256(license);
        if (!(await licenseAckCookieOk(grant.id, licenseSha, req.headers.get("cookie")?.match(/(?:^|;\s*)snap-dl-license=([^;]+)/)?.[1] ?? null))) {
          return Response.json({ error: "license_required" }, { status: 401 });
        }
      }
      if (settings.limit && (await photoDownloadCount(grant.id)) >= settings.limit) {
        return Response.json({ error: "download_limit_reached", limit: settings.limit }, { status: 403 });
      }
      await logShareAccess(grant.id, "download", req);
    }
    const dk = variantServeKey(asset, url.searchParams.get("variant"));

    // WEB-242 proofing mode: downloads deliver the watermarked preview
    // (pre-sale delivery) — original bytes never leave in proofing grants.
    // WEB-402: edit.jpg carries the watermark when the studio's watermark
    // is configured (edit-canvas composites it), so an edited look wins.
    // (WEB-196 review fix / WEB-261): this block MUST sit above the web/mid
    // size rungs below — a proofing grant with downloads + webSize on used
    // to reach the rungs first and download the clean unwatermarked
    // derivatives. Proofing swallows every size param.
    if (wantsDownload && grant.allowDownload && grant.proofing) {
      // WEB-440: validated ladder — a malformed stored key can't throw here.
      const wmKey = firstValidOrgKey(asset.organizationId, [asset.editKey, asset.previewWmKey, asset.previewKey], "proofing download");
      if (wmKey) {
        return serveAsset(
          req,
          { ...asset, storageKey: wmKey, mimeType: "image/jpeg", filename: asset.filename },
          true,
        );
      }
    }

    // WEB-261: web-size download = the ~2048px preview derivative with
    // download headers (zero server processing; derivative is clean by
    // construction, so the EXIF strip below never applies). WEB-402: an
    // edited look replaces the preview — the grade is the deliverable.
    // WEB-196: the mid rung (~1280px) serves the stored mid derivative,
    // falling back to the preview until the studio's on-demand prepare
    // pass (or a re-render) has landed one — closest smaller bytes.
    // (Proofing grants never reach here — the WEB-242 block above wins.)
    // WEB-440: every rung org-validated; malformed keys degrade, never 500.
    const sizeParam = url.searchParams.get("size");
    if (wantsDownload && grant.allowDownload && sizeParam === "web") {
      const key = firstValidOrgKey(asset.organizationId, [asset.editKey, asset.previewKey], "web download");
      if (key) {
        return serveAsset(req, { ...asset, storageKey: key, mimeType: "image/jpeg" }, true);
      }
    }
    if (wantsDownload && grant.allowDownload && sizeParam === "mid") {
      const key = firstValidOrgKey(asset.organizationId, [asset.midKey, asset.previewKey], "mid download");
      if (key) {
        return serveAsset(req, { ...asset, storageKey: key, mimeType: "image/jpeg" }, true);
      }
    }

    // WEB-172: original JPEG downloads from a client gallery are delivered
    // EXIF/GPS-free. Derivatives are metadata-free by construction; staff
    // downloads keep the photographer's originals untouched. WEB-402: with
    // an edited look, the edit.jpg IS the client deliverable (full-res,
    // EXIF-free) — the untouched original never needs stripping for it.
    // (WEB-440: only a VALID edit key takes this branch; a malformed one
    // falls through to the original-bytes path below instead of throwing.)
    if (wantsDownload && grant.allowDownload && !dk) {
      const editKey = firstValidOrgKey(asset.organizationId, [asset.editKey], "full-res download");
      if (editKey) {
        return serveAsset(
          req,
          { ...asset, storageKey: editKey, mimeType: "image/jpeg", filename: asset.filename },
          true,
        );
      }
    }
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

    // (audit fix): in a proofing (pre-sale) grant the original bytes never
    // stream inline — a bare GET used to reach serveAsset with the clean
    // storageKey. Force the watermarked derivative for every non-variant
    // serve; thumb when wm hasn't been generated. (WEB-402: an edited look
    // carries the watermark too, so it qualifies as the proof-grade serve.)
    if (grant.proofing && !dk) {
      // (WEB-440: validated ladder.)
      const wmKey = firstValidOrgKey(asset.organizationId, [asset.editKey, asset.previewWmKey, asset.thumbKey], "proofing inline");
      if (wmKey) return serveAsset(req, { ...asset, storageKey: wmKey, mimeType: "image/jpeg" }, grant.allowDownload);
    }
    return serveAsset(req, dk ? { ...asset, storageKey: dk, mimeType: "image/jpeg" } : asset, grant.allowDownload);
  }

  return Response.json({ error: "unauthorized" }, { status: 401 });
}

/** Approve / reject / reset an asset's status; set/clear its edit set. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  let body: { action?: string; value?: number; edits?: unknown };
  try {
    body = (await req.json()) as { action?: string; value?: number; edits?: unknown };
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
  // WEB-402: non-destructive edits — { action:"edits", edits:{…}|null }. The
  // client re-renders + re-uploads the edit.jpg derivative after this lands.
  if (body.action === "edits") {
    if (body.edits === null) {
      const r = await setAssetEdits(ctx.organizationId, id, null);
      if (!r.ok) return Response.json({ error: r.error }, { status: 404 });
      return Response.json({ ok: true, edits: null });
    }
    const normalized = normalizeEditSet(body.edits);
    if (normalized === null) return Response.json({ error: "invalid_edits" }, { status: 400 });
    const r = await setAssetEdits(ctx.organizationId, id, normalized);
    if (!r.ok) return Response.json({ error: r.error }, { status: 404 });
    return Response.json({ ok: true, edits: normalized });
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
