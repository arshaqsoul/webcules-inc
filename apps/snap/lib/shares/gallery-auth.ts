/* Gallery session + OTP gate (WEB-132). The `snap-g` cookie is a stateless
 * 30-day proof that THIS browser verified the grant's client email — grant
 * status and expiry are re-checked live on every request, so revocation cuts
 * off an open gallery mid-session. The cookie is scoped to grantId and can
 * never authenticate a dashboard/portal route (those read better-auth
 * sessions only).
 *
 * Email-cost guardrails (worst-case simulation, mandatory on ALL tiers):
 *   30 OTPs / client email / rolling 30d, 5 / email / 15min, 5 / IP / hour.
 * GALLERY_OTP_MODE=off is the email-shock contingency: no OTPs are sent and
 * the gate opens on link possession alone. */
import { and, desc, eq, gt, type SQL } from "drizzle-orm";
import { env } from "cloudflare:workers";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { grantIsEffectivelyActive, getGrantById } from "./grants";

const COOKIE_NAME = "snap-g";
const COOKIE_TTL_S = 30 * 24 * 3600;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const CAP_PER_EMAIL_30D = 30;
const CAP_PER_EMAIL_15MIN = 5;
const CAP_PER_IP_HOUR = 5;

/* ---------------- timing-safe compare ---------------- */

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------------- 30-day gallery cookie ---------------- */

async function hmacKey(): Promise<CryptoKey> {
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET not configured");
  const hkdf = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode("snap:gallery-cookie:v1") },
    hkdf,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );
}

async function sign(payload: string): Promise<string> {
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(mac))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Mint the Set-Cookie header value for a freshly verified browser. */
export async function mintGalleryCookie(grantId: string): Promise<string> {
  const payload = `${grantId}.${Math.floor(Date.now() / 1000)}`;
  const value = `${payload}.${await sign(payload)}`;
  return `${COOKIE_NAME}=${value}; Path=/; Max-Age=${COOKIE_TTL_S}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearGalleryCookie(): string {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

/** Resolve the gallery session for a request: cookie signature valid, fresh
 * (≤30d), AND the grant still effectively active (live DB check). */
export async function resolveGalleryAccess(headers: Headers): Promise<{ grant: typeof schema.shareGrants.$inferSelect } | null> {
  const match = headers.get("cookie")?.match(/(?:^|;\s*)snap-g=([^;]+)/);
  if (!match) return null;
  const parts = match[1].split(".");
  if (parts.length !== 3) return null;
  const [grantId, issued, sig] = parts;
  if (!/^[\da-f-]{36}$/.test(grantId) || !/^\d+$/.test(issued)) return null;
  if (!timingSafeEqualStr(sig, await sign(`${grantId}.${issued}`))) return null;
  if (Date.now() / 1000 - Number(issued) > COOKIE_TTL_S) return null;

  const grant = await getGrantById(grantId);
  return grant && grantIsEffectivelyActive(grant) ? { grant } : null;
}

/* ---------------- OTP issue / verify (capped) ---------------- */

export type OtpIssueResult =
  | { ok: true; code: string }
  | { ok: false; error: "otp_disabled" | "rate_limited" };

async function countSends(where: SQL | undefined): Promise<number> {
  if (!where) return 0;
  const db = getDb();
  const rows = await db.select({ id: schema.shareOtpLog.id }).from(schema.shareOtpLog).where(where);
  return rows.length;
}

export async function issueGalleryOtp(params: {
  grant: typeof schema.shareGrants.$inferSelect;
  email: string;
  ip: string | null;
}): Promise<OtpIssueResult> {
  if (env.GALLERY_OTP_MODE === "off") return { ok: false, error: "otp_disabled" };
  const db = getDb();
  const now = Date.now();

  const [perEmail30d, perEmail15m, perIp1h] = await Promise.all([
    countSends(and(eq(schema.shareOtpLog.email, params.email), gt(schema.shareOtpLog.createdAt, new Date(now - 30 * 86400e3)))),
    countSends(and(eq(schema.shareOtpLog.email, params.email), gt(schema.shareOtpLog.createdAt, new Date(now - 15 * 60e3)))),
    params.ip
      ? countSends(and(eq(schema.shareOtpLog.ip, params.ip), gt(schema.shareOtpLog.createdAt, new Date(now - 3600e3))))
      : Promise.resolve(0),
  ]);
  // Rejected sends are NOT logged — the caps count delivered emails only.
  if (perEmail30d >= CAP_PER_EMAIL_30D || perEmail15m >= CAP_PER_EMAIL_15MIN || perIp1h >= CAP_PER_IP_HOUR) {
    return { ok: false, error: "rate_limited" };
  }

  // 6-digit code, rejection-sampled for uniformity (then mod 1e6).
  let draw = crypto.getRandomValues(new Uint32Array(1))[0];
  while (draw >= 4_294_000_000) draw = crypto.getRandomValues(new Uint32Array(1))[0];
  const code = String(draw % 1_000_000).padStart(6, "0");

  await db.insert(schema.shareOtp).values({
    id: crypto.randomUUID(),
    grantId: params.grant.id,
    email: params.email,
    codeHash: await sha256Hex(`${code}:${params.grant.id}`),
    expiresAt: new Date(now + OTP_TTL_MS),
    attempts: 0,
  });
  await db.insert(schema.shareOtpLog).values({
    id: crypto.randomUUID(),
    grantId: params.grant.id,
    email: params.email,
    ip: params.ip,
  });
  return { ok: true, code };
}

/** Verify a submitted code against the grant's latest unexpired OTP.
 * Consumed on success; max 5 attempts per code. */
export async function verifyGalleryOtp(params: {
  grant: typeof schema.shareGrants.$inferSelect;
  code: string;
}): Promise<boolean> {
  const db = getDb();
  const row = (
    await db
      .select()
      .from(schema.shareOtp)
      .where(and(eq(schema.shareOtp.grantId, params.grant.id), gt(schema.shareOtp.expiresAt, new Date())))
      .orderBy(desc(schema.shareOtp.createdAt))
      .limit(1)
  )[0];
  if (!row || row.attempts >= OTP_MAX_ATTEMPTS) return false;

  const match = timingSafeEqualStr(await sha256Hex(`${params.code}:${params.grant.id}`), row.codeHash);
  if (!match) {
    await db.update(schema.shareOtp).set({ attempts: row.attempts + 1 }).where(eq(schema.shareOtp.id, row.id));
    return false;
  }
  await db.delete(schema.shareOtp).where(eq(schema.shareOtp.id, row.id));
  return true;
}

/* ---------------- Access audit (WEB-129 events) ---------------- */

export async function logShareAccess(
  grantId: string,
  event: "view" | "otp_sent" | "otp_success" | "otp_fail" | "download",
  req?: Request,
): Promise<void> {
  try {
    await getDb().insert(schema.shareAccessLogs).values({
      id: crypto.randomUUID(),
      grantId,
      event,
      ip: req?.headers.get("cf-connecting-ip") ?? null,
      userAgent: req?.headers.get("user-agent")?.slice(0, 250) ?? null,
    });
  } catch (err) {
    console.error("share_access_log insert failed:", String(err)); // audit must never break serving
  }
}

/* ---------------- request helpers ---------------- */

export function clientIp(req: Request): string | null {
  return req.headers.get("cf-connecting-ip");
}
