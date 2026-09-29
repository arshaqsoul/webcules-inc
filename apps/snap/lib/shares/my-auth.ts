/* Client-home auth (WEB-263) — /my is one email's window into every
 * gallery + sneak peek shared with that address. Passwordless: a 6-digit
 * code (10 min TTL, caps like the gallery OTP) mints a 30-day remembered
 * device cookie — an HMAC over the email (the home holds no secrets; each
 * gallery still gates behind its own grant session, minted on handoff). */
import { env } from "cloudflare:workers";
import { and, eq, gte, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";

const COOKIE = "snap-my";
const TTL_S = 30 * 86400;
const INFO = "snap:my-cookie:v1";
const CODE_TTL_MS = 10 * 60_000;

const enc = new TextEncoder();

async function hmacKey(): Promise<CryptoKey> {
  const hkdf = await crypto.subtle.importKey("raw", enc.encode(env.BETTER_AUTH_SECRET), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc.encode(INFO) }, hkdf, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"]);
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** base64url — emails contain dots, so the cookie payload's email part
 * must be dot-free for the 3-part split. */
function b64url(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  return atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}

/** Set-Cookie value for a verified email. */
export async function mintMyCookie(email: string): Promise<string> {
  const payload = `${b64url(email.toLowerCase())}.${Math.floor(Date.now() / 1000)}`;
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(payload));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(mac))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${COOKIE}=${payload}.${b64}; Path=/; Max-Age=${TTL_S}; HttpOnly; Secure; SameSite=Lax`;
}

/** Resolve the remembered email from a request's cookies (null = no
 * session). Signature + age verified; no DB. */
export async function resolveMySession(headers: Headers): Promise<string | null> {
  const match = headers.get("cookie")?.match(/(?:^|;\s*)snap-my=([^;]+)/);
  if (!match) return null;
  const parts = match[1].split(".");
  if (parts.length !== 3) return null;
  const [email, issued, sig] = parts;
  const expected = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(`${email}.${issued}`)))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  if (Date.now() / 1000 - Number(issued) > TTL_S) return null;
  try {
    return unb64url(email);
  } catch {
    return null;
  }
}

/* ---------------- OTP ---------------- */

export type MyOtpError = "rate_limited" | "no_galleries";

/** Whether any active grant or sneak-peek project exists for the email
 * (wrong emails never get a code — same enumeration guard as galleries). */
export async function emailHasContent(email: string): Promise<boolean> {
  const db = getDb();
  const e = email.toLowerCase();
  const grants = await db
    .select({ id: schema.shareGrants.id, organizationId: schema.shareGrants.organizationId })
    .from(schema.shareGrants)
    .where(and(eq(schema.shareGrants.clientEmail, e), eq(schema.shareGrants.status, "active")))
    .limit(5);
  if (grants.length) {
    // WEB-267: /my is Lite+ — only paid orgs' galleries count as content.
    const { getPlanEntitlements } = await import("@/lib/plans");
    for (const g of grants) {
      const ent = await getPlanEntitlements(g.organizationId);
      if ((ent?.id ?? "free") !== "free") return true;
    }
  }
  const peeks = await db
    .select({ id: schema.assets.id })
    .from(schema.assets)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.assets.projectId))
    .innerJoin(schema.clients, eq(schema.clients.id, schema.projects.clientId))
    .where(and(eq(schema.clients.email, e), eq(schema.assets.sneakPeek, true)))
    .limit(1);
  return peeks.length > 0;
}

export async function issueMyOtp(email: string): Promise<{ code: string } | { error: MyOtpError }> {
  const db = getDb();
  const e = email.toLowerCase();
  if (!(await emailHasContent(e))) return { error: "no_galleries" };
  const emailHash = await sha256Hex(e);

  // Caps: 5 codes / email / 15 min, 20 / email / day.
  const recent = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.myOtp)
    .where(and(eq(schema.myOtp.emailHash, emailHash), gte(schema.myOtp.createdAt, new Date(Date.now() - 15 * 60_000))));
  if ((recent[0]?.n ?? 0) >= 5) return { error: "rate_limited" };
  const today = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.myOtp)
    .where(and(eq(schema.myOtp.emailHash, emailHash), gte(schema.myOtp.createdAt, new Date(Date.now() - 86400_000))));
  if ((today[0]?.n ?? 0) >= 20) return { error: "rate_limited" };

  const rnd = crypto.getRandomValues(new Uint32Array(1));
  const code = String(100000 + (rnd[0] % 900000));
  await db.insert(schema.myOtp).values({
    id: crypto.randomUUID(),
    emailHash,
    codeHash: await sha256Hex(`${code}:${emailHash}`),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  return { code };
}

export async function verifyMyOtp(email: string, code: string): Promise<boolean> {
  const db = getDb();
  const e = email.toLowerCase();
  const emailHash = await sha256Hex(e);
  const rows = await db
    .select()
    .from(schema.myOtp)
    .where(and(eq(schema.myOtp.emailHash, emailHash), gte(schema.myOtp.expiresAt, new Date())))
    .orderBy(sql`${schema.myOtp.createdAt} DESC`)
    .limit(1);
  const row = rows[0];
  if (!row) return false;
  if (row.attempts >= 5) return false;
  const ok = (await sha256Hex(`${code}:${emailHash}`)) === row.codeHash;
  if (!ok) {
    await db.update(schema.myOtp).set({ attempts: row.attempts + 1 }).where(eq(schema.myOtp.id, row.id));
    return false;
  }
  await db.delete(schema.myOtp).where(eq(schema.myOtp.id, row.id)); // consume
  return true;
}
