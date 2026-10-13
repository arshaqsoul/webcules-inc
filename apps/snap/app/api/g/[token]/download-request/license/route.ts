/* /api/g/{token}/download-request/license (WEB-193) — the license-
 * acknowledgment gate. A gallery with license text set (download controls,
 * ≤ 2 KB, ALL tiers — never a feature gate) asks the visitor to agree
 * before downloads unlock. An agreement:
 *   1. appends an AUDIT-FROZEN row — the exact text + its SHA-256 as the
 *      visitor saw it; append-only, edits to the gallery text never
 *      rewrite it;
 *   2. mints a remembered-per-client cookie (30 d, HMAC-signed like the
 *      PIN/email cookies) bound to grant AND text version, so editing the
 *      license re-locks the gallery until it's agreed again.
 * Like the email gate this is legal cover, not an auth boundary; the
 * PIN/approval gates remain the security boundary. */
import { env } from "cloudflare:workers";

import { resolveGalleryAccess } from "@/lib/shares/gallery-auth";
import {
  MAX_LICENSE_ACKS_PER_HOUR,
  licenseAcksSince,
  licenseSha256,
  recordLicenseAck,
} from "@/lib/repos/downloads";
import { licenseTextOf } from "@/lib/gallery-downloads";
import { resolveGrantByToken } from "@/lib/shares/grants";

export const dynamic = "force-dynamic";

export const LICENSE_ACK_COOKIE = "snap-dl-license";
const TTL_S = 30 * 86400;

async function ackCookieValue(grantId: string, licenseSha: string): Promise<string> {
  const hkdf = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.BETTER_AUTH_SECRET), "HKDF", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode("snap:license-ack:v1") },
    hkdf,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${grantId}:${licenseSha}`));
  return btoa(String.fromCharCode(...new Uint8Array(mac))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Does the presented cookie acknowledge THIS text version for THIS grant?
 * (exported for the download routes + tests). */
export async function licenseAckCookieOk(grantId: string, licenseSha: string, presented: string | null | undefined): Promise<boolean> {
  if (!presented) return false;
  const a = presented;
  const b = await ackCookieValue(grantId, licenseSha);
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

  const license = licenseTextOf(grant);
  if (!license) return Response.json({ ok: true }); // nothing to acknowledge

  const body = (await req.json().catch(() => ({}))) as { agree?: boolean };
  if (body.agree !== true) return Response.json({ error: "agreement_required" }, { status: 400 });

  // Abuse ceiling: fresh agreements per grant per hour. Repeat downloads
  // short-circuit on the cookie in the download routes and never land here.
  const acks = await licenseAcksSince(grant.id, Date.now() - 3600_000);
  if (acks >= MAX_LICENSE_ACKS_PER_HOUR) {
    return Response.json({ error: "too_many_attempts" }, { status: 429 });
  }

  const sha = await licenseSha256(license);
  await recordLicenseAck({ grantId: grant.id, licenseSha: sha, licenseText: license, req });

  const value = await ackCookieValue(grant.id, sha);
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": `${LICENSE_ACK_COOKIE}=${value}; Path=/; Max-Age=${TTL_S}; HttpOnly; Secure; SameSite=Lax` } },
  );
}
