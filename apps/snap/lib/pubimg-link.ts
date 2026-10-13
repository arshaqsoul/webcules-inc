/* /api/pubimg/{assetId} links (WEB-345) — the public serving primitive for
 * portfolio images (site pages, embeds, and later the public API). Access =
 * HMAC signature over asset+expiry (minted server-side at render, no share
 * context — publicness comes from collection membership, re-resolved live
 * by the route on every fetch) AND a live resolve against the published
 * portfolio: curating an asset out, unpublishing the site, or flipping a
 * collection to unlisted kills the image on the next request, cache or no
 * cache. The route serves the web-size preview derivative only — never the
 * original, never RAW. Same shape as lib/photo-link.ts. */
import { env } from "cloudflare:workers";

const enc = new TextEncoder();

/** How long a minted pubimg URL stays valid (seconds). The pages that embed
 * these URLs are server-rendered per request, so visitors always hold fresh
 * links; the expiry bounds replay of copied URLs from dead pages. */
export const PUBIMG_TTL_SECONDS = 7 * 24 * 60 * 60;

async function hmacKey(): Promise<CryptoKey> {
  const secret = env.BETTER_AUTH_SECRET;
  return crypto.subtle.importKey("raw", enc.encode(`snap-pubimg:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function sign(assetId: string, exp: number): Promise<string> {
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${assetId}:${exp}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Signed public URL for a portfolio-curated asset (path + query). */
export async function pubimgLink(assetId: string, now = Date.now() / 1000): Promise<string> {
  const exp = Math.floor(now) + PUBIMG_TTL_SECONDS;
  return `/api/pubimg/${assetId}?e=${exp}&h=${await sign(assetId, exp)}`;
}

/** Constant-time signature check plus expiry window — tampered, expired or
 * malformed links all collapse to the same 404. */
export async function verifyPubimgSig(assetId: string, exp: string, sig: string, now = Date.now() / 1000): Promise<boolean> {
  if (!/^\d{1,12}$/.test(exp) || !/^[a-f0-9]{64}$/.test(sig)) return false;
  const e = Number(exp);
  if (!Number.isFinite(e) || e < now) return false;
  return timingSafeEqual(await sign(assetId, e), sig);
}

/** The two derivative slots /api/pubimg can serve (WEB-345: web-size preview
 * only — `plain` = preview, `wm` = watermarked preview). */
export type PubimgDerivative = "plain" | "wm";

/** Edge-cache key for the route's Cache API entries: asset + derivative +
 * portfolio revision (site.updated_at, bumped on every curation/publish
 * mutation) — a mutation rotates the key so stale bytes become unreachable
 * even before the eager delete lands. */
export function pubimgCacheKey(assetId: string, derivative: PubimgDerivative, revision: number): string {
  return `https://pubimg.cache/${assetId}?d=${derivative}&r=${revision}`;
}

/** Best-effort eager purge of the CURRENT cache entries for an asset at the
 * moment of a curate-out/unpublish (both derivative slots). No-op where the
 * Cache API is unavailable (tests, local dev) — the route re-resolves
 * membership before every cache hit, so a missed delete can never serve
 * curated-out bytes; and the revision rotation that follows makes every
 * missed entry unreachable regardless (delete is colo-local, rotation is
 * global). */
export async function purgePubimgCache(assetId: string, revision: number): Promise<void> {
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  if (!cache) return;
  await Promise.all(
    (["plain", "wm"] as const).map((d) => cache.delete(pubimgCacheKey(assetId, d, revision)).catch(() => undefined)),
  );
}
