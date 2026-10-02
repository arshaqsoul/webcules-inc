/* /api/g/{token}/download-request/verify (WEB-261) — download PIN entry.
 * Verifies the 4–8 digit PIN against the grant's stored hash (constant
 * time via digest comparison, capped attempts per grant) and mints a
 * remembered-per-client cookie (30 d, HMAC-signed like the session). */
import { env } from "cloudflare:workers";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { and, eq, sql } from "drizzle-orm";
import { resolveGalleryAccess } from "@/lib/shares/gallery-auth";
import { downloadSettingsOf } from "@/lib/repos/downloads";
import { hashDownloadPin, isValidPin } from "@/lib/gallery-downloads";
import { resolveGrantByToken } from "@/lib/shares/grants";

export const dynamic = "force-dynamic";

const COOKIE = "snap-dl";
const TTL_S = 30 * 86400;
const MAX_ATTEMPTS_PER_HOUR = 10;

async function dlCookieValue(grantId: string): Promise<string> {
  const hkdf = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.BETTER_AUTH_SECRET), "HKDF", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode("snap:download-cookie:v1") },
    hkdf,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(grantId));
  return btoa(String.fromCharCode(...new Uint8Array(mac))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The cookie the asset route accepts (exported for it + tests). */
export async function downloadCookieOk(grantId: string, presented: string | null | undefined): Promise<boolean> {
  if (!presented) return false;
  const a = presented;
  const b = await dlCookieValue(grantId);
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
  if (!settings.pinHash) return Response.json({ ok: true }); // nothing to gate

  const body = (await req.json().catch(() => ({}))) as { pin?: string };
  const pin = String(body.pin ?? "");
  if (!isValidPin(pin)) return Response.json({ error: "invalid_pin" }, { status: 400 });

  // Brute-force cap: 10 failed verifies per grant per hour.
  const db = getDb();
  const windowStart = Math.floor(Date.now() / 3600_000);
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.shareAccessLogs)
    .where(
      and(
        eq(schema.shareAccessLogs.grantId, grant.id),
        eq(schema.shareAccessLogs.event, "pin_fail"),
        sql`${schema.shareAccessLogs.createdAt} >= ${windowStart * 3600}`,
      ),
    );
  if ((rows[0]?.n ?? 0) >= MAX_ATTEMPTS_PER_HOUR) {
    return Response.json({ error: "too_many_attempts" }, { status: 429 });
  }

  const hash = await hashDownloadPin(pin, grant.id);
  if (hash !== settings.pinHash) {
    await db.insert(schema.shareAccessLogs).values({
      id: crypto.randomUUID(),
      grantId: grant.id,
      event: "pin_fail",
      createdAt: new Date(),
    });
    return Response.json({ error: "wrong_pin" }, { status: 401 });
  }

  const value = await dlCookieValue(grant.id);
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": `${COOKIE}=${value}; Path=/; Max-Age=${TTL_S}; HttpOnly; Secure; SameSite=Lax` } },
  );
}
