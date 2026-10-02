/* /api/g/{token}/music (WEB-259) — slideshow audio for the client gallery.
 * Guarded like every gallery surface: the snap-g cookie (grant-scoped,
 * liveness re-checked by the resolver), and the track is served ONLY if it
 * is the one this project's slideshow selected (acceptance: no track reaches
 * any gallery unless picked) and belongs to the grant's org. Range = scrub. */
import { resolveGalleryAccess } from "@/lib/shares/gallery-auth";
import { serveR2Range } from "@/lib/http-range";
import { getProjectSlideshow, getTrack, slideshowForTier } from "@/lib/repos/slideshow";
import { getPlanEntitlements } from "@/lib/plans";
import { resolveGrantByToken } from "@/lib/shares/grants";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: _token } = await params;
  const tokenGrant = await resolveGrantByToken(_token);
  if (!tokenGrant) return Response.json({ error: "unknown_gallery" }, { status: 404 });
  const access = await resolveGalleryAccess(req.headers, tokenGrant.id);
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

  const res = await serveR2Range({
    organizationId: grant.organizationId,
    key: track.storageKey,
    req,
    contentType: track.mimeType,
    cacheControl: "private, max-age=3600",
  });
  if (!res) return Response.json({ error: "not_found" }, { status: 404 });
  return res;
}
