/* Public cover links (WEB-258) — og:image cards for shared gallery links.
 * og crawlers (WhatsApp/Apple/iMessage link previews) fetch without cookies,
 * so the cover renders through a signed, grant-coupled URL: the signature is
 * an HMAC over asset+grant, and the route re-checks the grant live —
 * revoking or expiring the gallery kills the preview card too. Serves the
 * watermarked preview when one exists (watermark-aware), else the clean
 * preview — the same variant policy the gallery itself uses. */
import { env } from "cloudflare:workers";

const enc = new TextEncoder();

async function hmacKey(): Promise<CryptoKey> {
  const secret = env.BETTER_AUTH_SECRET;
  return crypto.subtle.importKey("raw", enc.encode(`snap-cover:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function sign(assetId: string, grantId: string): Promise<string> {
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${assetId}:${grantId}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Signed public URL for a gallery's og:image cover (path + query). */
export async function coverLink(assetId: string, grantId: string): Promise<string> {
  return `/api/cover/${assetId}?g=${grantId}&s=${await sign(assetId, grantId)}`;
}

/** Verify a cover-route signature. */
export async function verifyCoverSig(assetId: string, grantId: string, sig: string): Promise<boolean> {
  return timingSafeEqual(await sign(assetId, grantId), sig);
}
