/* /api/studio/slideshow-music/{id} (WEB-259) — DELETE a track (R2 cleaned,
 * galleries fall back to silent) and GET as a staff preview stream (Range
 * supported for scrubbing). */
import { permissionDenied } from "@/lib/permissions";
import { getOrgContext } from "@/lib/session";
import { serveR2Range } from "@/lib/http-range";
import { deleteTrack, getTrack } from "@/lib/repos/slideshow";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "settings.write");
  if (denied) return denied;
  const { id } = await params;
  const track = await getTrack(ctx.organizationId, id);
  if (!track) return Response.json({ error: "not_found" }, { status: 404 });

  const res = await serveR2Range({
    organizationId: ctx.organizationId,
    key: track.storageKey,
    req,
    contentType: track.mimeType,
    cacheControl: "private, max-age=3600",
  });
  if (!res) return Response.json({ error: "not_found" }, { status: 404 });
  return res;
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "settings.write");
  if (denied) return denied;
  const { id } = await params;
  const removed = await deleteTrack(ctx.organizationId, id);
  if (!removed) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}
