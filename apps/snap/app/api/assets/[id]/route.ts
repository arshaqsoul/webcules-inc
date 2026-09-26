/* Authorized media proxy — every byte served passes an access check.
 * Staff path: org-scoped via better-auth session. Gallery path: the snap-g
 * OTP cookie (grant-scoped, 30d) + live grant re-check + asset ∈ grant set.
 * Streams from R2 with Range support (video scrubbing) and
 * inline/attachment modes; gallery downloads respect the grant's policy. */
import { getObject } from "@/lib/storage/service";
import { deleteAsset, getAsset, setAssetStatus } from "@/lib/repos/assets";
import { getOrgContext } from "@/lib/session";
import { logShareAccess, resolveGalleryAccess } from "@/lib/shares/gallery-auth";
import { assetInGrant, getGrantById } from "@/lib/shares/grants";

export const dynamic = "force-dynamic";

type ServableAsset = {
  id: string;
  organizationId: string;
  storageKey: string;
  filename: string;
  mimeType: string;
};

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
    return serveAsset(req, asset, true);
  }

  // Gallery path — snap-g cookie, live grant check, asset ∈ grant set.
  const access = await resolveGalleryAccess(req.headers);
  if (access) {
    const inSet = await assetInGrant(access.grant.id, id);
    if (!inSet) return Response.json({ error: "not_found" }, { status: 404 });
    const grant = await getGrantById(access.grant.id); // fresh row for expiry/policy
    const asset = await getAsset(access.grant.organizationId, id);
    if (!asset || !grant) return Response.json({ error: "not_found" }, { status: 404 });
    if (wantsDownload && grant.allowDownload) {
      await logShareAccess(grant.id, "download", req);
    }
    return serveAsset(req, asset, grant.allowDownload);
  }

  return Response.json({ error: "unauthorized" }, { status: 401 });
}

/** Approve / reject / reset an asset's status. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  let body: { action?: string };
  try {
    body = (await req.json()) as { action?: string };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (body.action !== "approve" && body.action !== "reject" && body.action !== "reset") {
    return Response.json({ error: "invalid_action" }, { status: 400 });
  }
  const status = body.action === "approve" ? "approved" : body.action === "reject" ? "rejected" : "uploaded";
  await setAssetStatus(ctx.organizationId, id, status);
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
