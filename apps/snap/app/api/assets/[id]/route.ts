/* Authorized media proxy — every byte served passes the org check. Streams
 * from R2 with Range support (video scrubbing) and inline/attachment modes.
 * Gallery-grant access (public share links) extends this in Epic 9. */
import { getObject } from "@/lib/storage/service";
import { deleteAsset, getAsset, setAssetStatus } from "@/lib/repos/assets";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const asset = await getAsset(ctx.organizationId, id);
  if (!asset) return Response.json({ error: "not_found" }, { status: 404 });

  const object = await getObject(ctx.organizationId, asset.storageKey);
  if (!object) return Response.json({ error: "not_found" }, { status: 404 });

  const url = new URL(req.url);
  const disposition = url.searchParams.get("download") === "1" ? "attachment" : "inline";
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
        const slice = await getObject(ctx.organizationId, asset.storageKey, {
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
