/* /api/g/{token}/music (WEB-259) — slideshow audio for the client gallery.
 * Guarded like every gallery surface: the snap-g cookie (grant-scoped,
 * liveness re-checked by the resolver), and the track is served ONLY if it
 * is the one this project's slideshow selected (acceptance: no track reaches
 * any gallery unless picked) and belongs to the grant's org. Range = scrub. */
import { resolveGalleryAccess } from "@/lib/shares/gallery-auth";
import { getObject } from "@/lib/storage/service";
import { getProjectSlideshow, getTrack, slideshowForTier } from "@/lib/repos/slideshow";
import { getPlanEntitlements } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: _token } = await params;
  const access = await resolveGalleryAccess(req.headers);
  if (!access) return Response.json({ error: "unauthorized" }, { status: 401 });
  const grant = access.grant;

  const url = new URL(req.url);
  const trackId = url.searchParams.get("a") ?? "";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(trackId)) return Response.json({ error: "not_found" }, { status: 404 });

  const [ent, config] = await Promise.all([
    getPlanEntitlements(grant.organizationId),
    getProjectSlideshow(grant.organizationId, grant.projectId),
  ]);
  const effective = slideshowForTier(config, (ent?.id ?? "free") !== "free");
  if (!effective?.music || effective.music !== trackId) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const track = await getTrack(grant.organizationId, trackId);
  if (!track) return Response.json({ error: "not_found" }, { status: 404 });

  const headers = new Headers({
    "Content-Type": track.mimeType,
    "Cache-Control": "private, max-age=3600",
    "Accept-Ranges": "bytes",
  });
  const range = req.headers.get("Range");
  if (range) {
    const match = range.match(/bytes=(\d*)-(\d*)/);
    if (match) {
      const object = await getObject(grant.organizationId, track.storageKey);
      if (!object?.size) return Response.json({ error: "not_found" }, { status: 404 });
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), object.size - 1) : object.size - 1;
      if (start <= end && start < object.size) {
        const slice = await getObject(grant.organizationId, track.storageKey, { offset: start, length: end - start + 1 });
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
  const object = await getObject(grant.organizationId, track.storageKey);
  if (!object) return Response.json({ error: "not_found" }, { status: 404 });
  return new Response(object.body, { headers });
}
