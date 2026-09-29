/* /api/studio/slideshow-music/{id} (WEB-259) — DELETE a track (R2 cleaned,
 * galleries fall back to silent) and GET as a staff preview stream (Range
 * supported for scrubbing). */
import { getOrgContext } from "@/lib/session";
import { getObject } from "@/lib/storage/service";
import { deleteTrack, getTrack } from "@/lib/repos/slideshow";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const track = await getTrack(ctx.organizationId, id);
  if (!track) return Response.json({ error: "not_found" }, { status: 404 });

  const headers = new Headers({
    "Content-Type": track.mimeType,
    "Cache-Control": "private, max-age=60",
    "Accept-Ranges": "bytes",
  });
  const range = req.headers.get("Range");
  if (range) {
    const match = range.match(/bytes=(\d*)-(\d*)/);
    if (match) {
      const object = await getObject(ctx.organizationId, track.storageKey);
      if (!object?.size) return Response.json({ error: "not_found" }, { status: 404 });
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), object.size - 1) : object.size - 1;
      if (start <= end && start < object.size) {
        const slice = await getObject(ctx.organizationId, track.storageKey, { offset: start, length: end - start + 1 });
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
  const object = await getObject(ctx.organizationId, track.storageKey);
  if (!object) return Response.json({ error: "not_found" }, { status: 404 });
  return new Response(object.body, { headers });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const removed = await deleteTrack(ctx.organizationId, id);
  if (!removed) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}
