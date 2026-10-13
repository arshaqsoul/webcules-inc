/* /api/g/{token}/download-request/email (WEB-194) — the email-capture gate.
 * Galleries with download_settings.emailCapture on ask for an email before
 * downloads unlock (guest galleries / minis / event shares). The submitted
 * address is recorded for the studio (who took files) and mints a
 * remembered-per-client cookie (30 d, HMAC-signed like the PIN cookie) that
 * the asset + zip routes accept. No verification email is sent — this is a
 * lead-capture signal, not an auth boundary; the PIN/approval gates remain
 * the security boundary. */
import { env } from "cloudflare:workers";

import { resolveGalleryAccess } from "@/lib/shares/gallery-auth";
import {
  MAX_EMAIL_CAPTURES_PER_HOUR,
  downloadSettingsOf,
  emailCapturesSince,
  recordEmailCapture,
} from "@/lib/repos/downloads";
import { normalizeCaptureEmail } from "@/lib/gallery-downloads";
import { resolveGrantByToken } from "@/lib/shares/grants";

export const dynamic = "force-dynamic";

export const EMAIL_CAPTURE_COOKIE = "snap-dl-email";
const TTL_S = 30 * 86400;

async function emailCookieValue(grantId: string): Promise<string> {
  const hkdf = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.BETTER_AUTH_SECRET), "HKDF", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode("snap:email-capture:v1") },
    hkdf,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(grantId));
  return btoa(String.fromCharCode(...new Uint8Array(mac))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The cookie the asset + zip routes accept (exported for them + tests). */
export async function emailCaptureCookieOk(grantId: string, presented: string | null | undefined): Promise<boolean> {
  if (!presented) return false;
  const a = presented;
  const b = await emailCookieValue(grantId);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: _t } = await params;
  const tokenGrant = await resolveGrantByToken(_t);
  if (!tokenGrant) return Response.json({ error: "unknown_gallery" }, { status: 404 });
  const access = await resolveGalleryAccess(req.headers, tokenGrant.id);
  if (!access) return Response.json({ error: "unauthorized" }, { status: 401 });
  const grant = access.grant;

  const settings = downloadSettingsOf(grant);
  if (!settings.emailCapture) return Response.json({ ok: true }); // nothing to gate

  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = normalizeCaptureEmail(String(body.email ?? ""));
  if (!email) return Response.json({ error: "invalid_email" }, { status: 400 });

  // Abuse ceiling: captures per grant per hour (a guest types it once or
  // twice; a script hits this). Verified guests who re-submit stay free —
  // the cookie short-circuits before this check in the download routes.
  const captures = await emailCapturesSince(grant.id, Date.now() - 3600_000);
  if (captures >= MAX_EMAIL_CAPTURES_PER_HOUR) {
    return Response.json({ error: "too_many_attempts" }, { status: 429 });
  }

  await recordEmailCapture({ grantId: grant.id, email, req });

  const value = await emailCookieValue(grant.id);
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": `${EMAIL_CAPTURE_COOKIE}=${value}; Path=/; Max-Age=${TTL_S}; HttpOnly; Secure; SameSite=Lax` } },
  );
}
