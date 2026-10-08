/* "Connect an existing Stripe account" (WEB-352). A photographer who already has a
 * Stripe account connects it through Stripe's OAuth flow instead of creating a new one.
 * The resulting account is a Standard account: its own full dashboard, it pays its own
 * Stripe fees, Snap pays nothing and charges directly on it - the same model as the
 * accounts Snap creates (see lib/connect.ts).
 *
 * The flow is hidden until STRIPE_CONNECT_CLIENT_ID is set (Stripe dashboard -> Connect ->
 * Onboarding options -> OAuth). The `state` parameter is a signed, expiring token that is
 * bound to the studio, so a callback can only complete a connection that this studio's own
 * signed-in user started (CSRF + account-mix-up protection). */

export const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

const enc = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  try {
    const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
    const bin = atob(b64);
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

/** `{organizationId}.{nonce}.{expiresAtMs}.{signature}` - signed with the app secret. */
export async function signOAuthState(secret: string, organizationId: string, nowMs: number = Date.now()): Promise<string> {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const payload = `${organizationId}.${nonce}.${nowMs + OAUTH_STATE_TTL_MS}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), enc.encode(payload));
  return `${payload}.${toBase64Url(sig)}`;
}

/** True only for an unexpired state signed by this app for exactly this studio. */
export async function verifyOAuthState(
  secret: string,
  state: string | null | undefined,
  organizationId: string,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (!state || state.length > 300) return false;
  const parts = state.split(".");
  if (parts.length !== 4) return false;
  const [org, nonce, exp, sig] = parts;
  if (org !== organizationId || !/^[a-f0-9]{32}$/.test(nonce) || !/^\d{10,16}$/.test(exp)) return false;
  if (Number(exp) < nowMs) return false;
  const sigBytes = fromBase64Url(sig);
  if (!sigBytes) return false;
  return crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), sigBytes, enc.encode(`${org}.${nonce}.${exp}`));
}

/** The Stripe "Connect with Stripe" authorize URL. */
export function oauthAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  email?: string | null;
  businessName?: string | null;
}): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId,
    scope: "read_write",
    redirect_uri: input.redirectUri,
    state: input.state,
  });
  if (input.email) q.set("stripe_user[email]", input.email);
  if (input.businessName) q.set("stripe_user[business_name]", input.businessName.slice(0, 100));
  return `https://connect.stripe.com/oauth/authorize?${q.toString()}`;
}

/** Where Stripe sends the user back to (must be registered in the Stripe OAuth settings). */
export function oauthRedirectUri(appOrigin: string): string {
  return `${appOrigin.replace(/\/+$/, "")}/api/studio/payouts/oauth/callback`;
}
