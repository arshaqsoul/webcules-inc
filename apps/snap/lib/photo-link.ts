/* Public share-card image links (WEB-262) — the og:image + <img> behind
 * /p/{token} photo share pages. Same shape as the cover route: HMAC over
 * asset+share, live re-resolution by the route (revocation kills the card),
 * watermark-aware variant chain. Crawlers and visitors carry no cookies. */
import { env } from "cloudflare:workers";

const enc = new TextEncoder();

async function hmacKey(): Promise<CryptoKey> {
  const secret = env.BETTER_AUTH_SECRET;
  return crypto.subtle.importKey("raw", enc.encode(`snap-photo-share:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function sign(assetId: string, shareId: string): Promise<string> {
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${assetId}:${shareId}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Signed public URL for a shared photo's card image (path + query). */
export async function photoShareImageLink(assetId: string, shareId: string): Promise<string> {
  return `/api/pimg/${assetId}?s=${shareId}&h=${await sign(assetId, shareId)}`;
}

export async function verifyPhotoShareImageSig(assetId: string, shareId: string, sig: string): Promise<boolean> {
  return timingSafeEqual(await sign(assetId, shareId), sig);
}
