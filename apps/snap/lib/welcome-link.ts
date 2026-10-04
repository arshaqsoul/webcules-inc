/* Signed public URL for a gallery's welcome collage (the image heading the
 * "your photos are ready" email and the gallery). Mail clients and their
 * image proxies fetch without cookies, so access is an HMAC over the image
 * id - and the route re-checks that a live gallery still references it, so
 * revoking or expiring the gallery stops the image loading (same pattern as
 * the og:image cover links in lib/cover-link.ts). */
import { env } from "cloudflare:workers";

import { timingSafeEqual } from "./cover-link";

const enc = new TextEncoder();

async function sign(imageId: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(`snap-welcome:${env.BETTER_AUTH_SECRET}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(imageId));
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/** Path + query for a welcome image (prefix with clientUrl for emails). */
export async function welcomeLink(imageId: string): Promise<string> {
  return `/api/welcome/${imageId}?s=${await sign(imageId)}`;
}

export async function verifyWelcomeSig(imageId: string, sig: string): Promise<boolean> {
  return timingSafeEqual(await sign(imageId), sig);
}
