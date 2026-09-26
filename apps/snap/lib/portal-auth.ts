/* Portal authentication (WEB-131) — passwordless magic-code login + a
 * portal-scoped signed session cookie. Deliberately separate from staff
 * better-auth: a portal session NEVER carries dashboard rights; the only
 * thing it proves is control of an email that has client records. Every
 * portal page re-resolves client rows live, so deleting the last client
 * record kills the session's meaning immediately.
 *
 * Enumeration-safe by construction: the login response is identical whether
 * or not the email has a portal; codes are only minted for real client
 * emails; staff emails get a "use your dashboard login" mail instead. */
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";

import { getDb } from "./db";
import * as schema from "./db-schema";

const COOKIE_NAME = "snap-p";
const COOKIE_TTL_S = 30 * 86400;
const OTP_TTL_MS = 10 * 60e3;
const OTP_MAX_ATTEMPTS = 5;
const CAP_PER_EMAIL_30D = 30;
const CAP_PER_EMAIL_15MIN = 5;
const CAP_PER_IP_HOUR = 5;

/* ---------------- signed portal cookie ---------------- */

async function hmacKey(): Promise<CryptoKey> {
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET not configured");
  const hkdf = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode("snap:portal-session:v1") },
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

export async function mintPortalCookie(email: string): Promise<string> {
  const payload = `${email}.${Math.floor(Date.now() / 1000)}`;
  return `${COOKIE_NAME}=${payload}.${await sign(payload)}; Path=/; Max-Age=${COOKIE_TTL_S}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearPortalCookie(): string {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

/** The portal session email — signature valid, fresh, AND still holds at
 * least one client record (live check). Payload is `email.issuedAt`; emails
 * contain dots (example.com), so parse from the RIGHT. */
export async function resolvePortalSession(headers: Headers): Promise<string | null> {
  const match = headers.get("cookie")?.match(/(?:^|;\s*)snap-p=([^;]+)/);
  if (!match) return null;
  const raw = decodeURIComponent(match[1]);
  const idx = raw.lastIndexOf(".");
  if (idx < 0) return null;
  const payload = raw.slice(0, idx);
  const sig = raw.slice(idx + 1);
  if (!timingSafeEqualStr(sig, await sign(payload))) return null;
  const dot = payload.lastIndexOf(".");
  const email = payload.slice(0, dot).toLowerCase();
  const issued = payload.slice(dot + 1);
  if (!email || !/^\d+$/.test(issued)) return null;
  if (Date.now() / 1000 - Number(issued) > COOKIE_TTL_S) return null;
  const rows = await getDb()
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(eq(schema.clients.email, email))
    .limit(1);
  return rows.length ? email : null;
}

/* ---------------- magic code ---------------- */

export type PortalOtpIssue =
  | { ok: true; code: string }
  | { ok: false; error: "rate_limited" };

export async function issuePortalOtp(params: { email: string; ip: string | null }): Promise<PortalOtpIssue> {
  const db = getDb();
  const now = Date.now();
  const email = params.email.toLowerCase();

  const counts = await Promise.all([
    db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM portal_otp_log WHERE email = ${email} AND created_at > unixepoch() - 30*86400`).then((r) => r[0]?.n ?? 0),
    db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM portal_otp_log WHERE email = ${email} AND created_at > unixepoch() - 900`).then((r) => r[0]?.n ?? 0),
    params.ip
      ? db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM portal_otp_log WHERE ip = ${params.ip} AND created_at > unixepoch() - 3600`).then((r) => r[0]?.n ?? 0)
      : Promise.resolve(0),
  ]);
  if (counts[0] >= CAP_PER_EMAIL_30D || counts[1] >= CAP_PER_EMAIL_15MIN || counts[2] >= CAP_PER_IP_HOUR) {
    return { ok: false, error: "rate_limited" };
  }

  let draw = crypto.getRandomValues(new Uint32Array(1))[0];
  while (draw >= 4_294_000_000) draw = crypto.getRandomValues(new Uint32Array(1))[0];
  const code = String(draw % 1_000_000).padStart(6, "0");

  await db.insert(schema.portalOtp).values({
    id: crypto.randomUUID(),
    email,
    codeHash: await sha256Hex(`${code}:${email}`),
    expiresAt: new Date(now + OTP_TTL_MS),
    attempts: 0,
  });
  await db.insert(schema.portalOtpLog).values({ id: crypto.randomUUID(), email, ip: params.ip });
  return { ok: true, code };
}

/** Verify against the latest unexpired code; consumed on success, max 5
 * attempts per code. */
export async function verifyPortalOtp(email: string, code: string): Promise<boolean> {
  const db = getDb();
  const row = (
    await db
      .select()
      .from(schema.portalOtp)
      .where(and(eq(schema.portalOtp.email, email.toLowerCase()), gt(schema.portalOtp.expiresAt, new Date())))
      .orderBy(desc(schema.portalOtp.createdAt))
      .limit(1)
  )[0];
  if (!row || row.attempts >= OTP_MAX_ATTEMPTS) return false;

  const match = timingSafeEqualStr(await sha256Hex(`${code}:${email.toLowerCase()}`), row.codeHash);
  if (match) {
    await db
      .update(schema.portalOtp)
      .set({ attempts: OTP_MAX_ATTEMPTS })
      .where(eq(schema.portalOtp.id, row.id));
    return true;
  }
  await db
    .update(schema.portalOtp)
    .set({ attempts: row.attempts + 1 })
    .where(eq(schema.portalOtp.id, row.id));
  return false;
}

/** Does this email belong to studio staff (any org membership)? Staff get a
 * "use your dashboard login" email instead of a portal code. */
export async function isStaffEmail(email: string): Promise<boolean> {
  const rows = await getDb().all<{ n: number }>(sql`
    SELECT COUNT(*) AS n FROM member m JOIN "user" u ON u.id = m.user_id WHERE u.email = ${email.toLowerCase()}
  `);
  return (rows[0]?.n ?? 0) > 0;
}
