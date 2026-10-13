/* /api/pubimg/{assetId} (WEB-345) — the public portfolio image primitive
 * shared by the portfolio site (A), embeds (C) and later the public API
 * (B). Access = HMAC signature over asset+expiry (minted at render in
 * getPublishedPortfolio via lib/pubimg-link.ts) AND a LIVE resolve of
 * collection membership on every request: curating an asset out,
 * unlisting its collection, or unpublishing the site 404s the next fetch
 * immediately, cache or no cache. Serves the web-size preview derivative
 * ONLY — never the original storage key, never RAW. Watermark-aware per
 * studio policy. Cache API entries are keyed asset+derivative+site
 * revision so every revoking mutation rotates them; the revoking repo
 * paths also delete eagerly. Crawlers and visitors carry no cookies. */
import { getObject } from "@/lib/storage/service";
import { pubimgCacheKey, verifyPubimgSig, type PubimgDerivative } from "@/lib/pubimg-link";
import { resolvePublicPortfolioImage } from "@/lib/repos/portfolio";
import { getPlanEntitlements } from "@/lib/plans";
import { effectiveWatermark } from "@/lib/watermark";
import { getStudioProfile } from "@/lib/repos/studios";

export const dynamic = "force-dynamic";

/** What visitors/browsers get: a day of freshness, a week of
 * stale-while-revalidate — revocation is enforced server-side on every
 * fetch, so this only bounds how long a visitor's OWN cache hides a
 * curate-out, not what the edge will serve. */
const CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";
/** What the internal edge entry gets: effectively immutable, because its
 * key embeds the site revision — a revoking mutation rotates the key rather
 * than needing the entry to expire (WEB-345 "long-lived edge cache"). */
const EDGE_CACHE_CONTROL = "public, max-age=31536000, immutable";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const exp = url.searchParams.get("e") ?? "";
  const sig = url.searchParams.get("h") ?? "";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  // Tampered, expired or malformed signatures collapse to the same 404 as
  // unknown assets — no oracle about what exists.
  if (!(await verifyPubimgSig(id, exp, sig))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  // Live public-ness resolve BEFORE any cache read: membership is the
  // boundary, so a curated-out asset 404s even if an edge entry lingers.
  const resolved = await resolvePublicPortfolioImage(id);
  if (!resolved) return Response.json({ error: "not_found" }, { status: 404 });

  // Watermark variant: portfolio context has no project override — the
  // studio's own policy decides (pimg's effectiveWatermark chain).
  const [ent, profile] = await Promise.all([
    getPlanEntitlements(resolved.organizationId),
    getStudioProfile(resolved.organizationId),
  ]);
  const watermarked =
    effectiveWatermark({
      ent,
      brand: profile?.brand ?? null,
      studioName: profile?.studioName,
    }) !== null;
  const derivative: PubimgDerivative = watermarked ? "wm" : "plain";
  // Web-size preview derivative only. If no derivative exists yet (upload
  // still processing), that is a 404 — NEVER fall through to the original.
  const key = watermarked ? resolved.previewWmKey ?? resolved.previewKey : resolved.previewKey;
  if (!key) return Response.json({ error: "not_found" }, { status: 404 });

  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const cacheKey = pubimgCacheKey(id, derivative, resolved.revision);
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) {
      const headers = new Headers(hit.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(hit.body, { status: 200, headers });
    }
  }

  const object = await getObject(resolved.organizationId, key);
  if (!object) return Response.json({ error: "not_found" }, { status: 404 });
  const headers = new Headers({
    "Content-Type": object.httpMetadata?.contentType ?? "image/jpeg",
    "Cache-Control": CACHE_CONTROL,
    "Access-Control-Allow-Origin": "*",
  });
  const response = new Response(object.body, { status: 200, headers });
  if (cache) {
    // Best-effort fill; membership is re-resolved ahead of every future hit.
    await cache.put(cacheKey, response.clone()).catch(() => undefined);
  }
  return response;
}
