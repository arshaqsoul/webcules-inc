/* Store preview sessions (WEB-277, Commerce C1 6/7) — the server-side flag
 * that makes "Preview the store as a client" incapable of ever creating a
 * real order.
 *
 * How the flag works:
 *  - POST /api/studio/store-preview (dashboard session required) signs a
 *    token for the studio's org with BETTER_AUTH_SECRET (HMAC-SHA256) and
 *    sets it as an HttpOnly cookie. Only the server can mint one; the value
 *    is bound to a single org id.
 *  - The preview page (/dashboard/store/preview) renders the client store
 *    view with ordering disabled ("Preview only" buttons, no grant token,
 *    no cart endpoints are ever called).
 *  - Cart and checkout mutations refuse preview sessions: the API layer
 *    reads the cookie (storePreviewActive) and passes `preview: true` into
 *    the repo calls, which refuse with "preview_refused" before any write.
 *    A preview session therefore cannot create a cart, add a line, or mint
 *    a Stripe Checkout Session — asserted in tests/integration/store-preview.test.ts.
 *
 * Pure module on purpose (no cloudflare:workers, no next/headers) so the
 * token math runs under workerd tests; the route layer supplies the secret. */

export const STORE_PREVIEW_COOKIE = "snap_store_preview";

/** b64url of the HMAC-SHA256 of `organizationId` under `secret`. */
async function sign(organizationId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(organizationId));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The cookie value a preview session carries: `<orgId>.<sig>`. */
export async function signStorePreviewToken(organizationId: string, secret: string): Promise<string> {
  return `${organizationId}.${await sign(organizationId, secret)}`;
}

/** Constant-time-ish string compare (length leak is fine here — org ids are
 * UUIDs and the token format is public). */
async function verifyStorePreviewToken(token: string, organizationId: string, secret: string): Promise<boolean> {
  const expected = await signStorePreviewToken(organizationId, secret);
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function parseCookieHeader(header: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    out.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  return out;
}

/** True when the request's cookies carry a valid preview token for THIS org.
 * Route layers call this and pass the result into cart/checkout repos as
 * `preview: true`, which refuse the mutation. */
export async function storePreviewActive(
  cookieHeader: string | null,
  organizationId: string,
  secret: string,
): Promise<boolean> {
  const token = parseCookieHeader(cookieHeader).get(STORE_PREVIEW_COOKIE);
  if (!token) return false;
  return verifyStorePreviewToken(token, organizationId, secret);
}
