/* Forms repository (WEB-248) — questionnaire responses (tokenized client
 * links, contract/grant pattern), public form-file presigns (HMAC-bound R2
 * keys, no open relay), and the shared fixed-window rate limiter for public
 * form endpoints. */
import { env } from "cloudflare:workers";
import { and, eq, sql } from "drizzle-orm";

import { getDb } from "../db";
import * as schema from "../db-schema";
import { decryptToken, encryptToken, hashToken, mintToken } from "../shares/grants";
import { presignPut } from "../uploads";
import type { FormAnswers } from "../forms";

export type FormResponseRow = typeof schema.formResponses.$inferSelect;

/* ---------------- Rate limiting (public form endpoints) ---------------- */

const FORM_SUBMITS_PER_MIN = 10;
const FORM_PRESIGNS_PER_MIN = 30;
const WINDOW_S = 60;

/** Fixed-window counter on the shared rate_limit table. Buckets are
 * purpose-prefixed so form limits never interact with other consumers. */
export async function checkFormRate(kind: "submit" | "presign", ip: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % WINDOW_S);
  const key = `form:${kind}:${ip}`;
  const rows = await getDb().all<{ count: number }>(sql`
    INSERT INTO rate_limit (id, key, count, last_request) VALUES (${crypto.randomUUID()}, ${key}, 1, ${windowStart})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limit.last_request < ${windowStart} THEN 1 ELSE rate_limit.count + 1 END,
      last_request = ${windowStart}
    RETURNING count
  `);
  const limit = kind === "submit" ? FORM_SUBMITS_PER_MIN : FORM_PRESIGNS_PER_MIN;
  return (rows[0]?.count ?? 0) <= limit;
}

/* ---------------- Public form-file presigns ---------------- */

/** HMAC binding a presigned file key to this deployment — a submitter can
 * only reference keys this server minted for them. */
async function fileHmac(key: string): Promise<string> {
  const secret = env.BETTER_AUTH_SECRET ?? "snap-dev-secret";
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey("raw", enc.encode(`snap-form-file:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(key));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const SAFE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 .()_-]{0,127}$/;

/** Mint a public presign for a form file answer. Keys live under the org
 * prefix with a random component (no user-controlled path traversal). */
export async function presignFormFile(params: {
  organizationId: string;
  filename: string;
  bytes: number;
  mimeType: string;
  maxBytes: number;
}): Promise<{ ok: true; url: string; key: string; token: string } | { ok: false; error: "too_large" | "invalid_name" }> {
  if (params.bytes < 1 || params.bytes > params.maxBytes) return { ok: false, error: "too_large" };
  const safe = params.filename.replace(/\s+/g, " ").trim();
  if (!SAFE_NAME_RE.test(safe)) return { ok: false, error: "invalid_name" };
  const key = `${params.organizationId}/form-files/${crypto.randomUUID()}/${safe}`;
  const url = await presignPut(key, { expiresIn: 300, contentType: params.mimeType || "application/octet-stream" });
  return { ok: true, url, key, token: await fileHmac(key) };
}

/** Verify a file answer's key was minted by this server. */
export async function verifyFormFileKey(organizationId: string, key: string, token: string): Promise<boolean> {
  if (!key.startsWith(`${organizationId}/form-files/`)) return false;
  return timingSafeEqual(await fileHmac(key), token);
}

/* ---------------- Questionnaire responses ---------------- */

/** Apply a questionnaire template to a project — mints the tokenized client
 * * link (link-possession, like contracts). One open (unsubmitted) response
 * per template+project: re-sending reuses it. */
export async function createFormResponse(params: {
  organizationId: string;
  projectId: string;
  templateId: string;
  clientEmail?: string | null;
}): Promise<{ response: FormResponseRow; token: string }> {
  const db = getDb();
  const existing = (
    await db
      .select()
      .from(schema.formResponses)
      .where(
        and(
          eq(schema.formResponses.organizationId, params.organizationId),
          eq(schema.formResponses.projectId, params.projectId),
          eq(schema.formResponses.templateId, params.templateId),
          sql`${schema.formResponses.submittedAt} IS NULL`,
        ),
      )
      .limit(1)
  )[0];
  if (existing) {
    const token = existing.tokenEnc ? await decryptToken(existing.tokenEnc) : null;
    if (token) return { response: existing, token };
    // Undecryptable legacy row (shouldn't happen) — fall through and mint a
    // fresh response by archiving this one as submitted-less dead weight.
    await db.delete(schema.formResponses).where(eq(schema.formResponses.id, existing.id));
  }
  const id = crypto.randomUUID();
  const token = mintToken();
  await db.insert(schema.formResponses).values({
    id,
    organizationId: params.organizationId,
    projectId: params.projectId,
    templateId: params.templateId,
    clientEmail: params.clientEmail?.toLowerCase() ?? null,
    accessTokenHash: await hashToken(token),
    tokenEnc: await encryptToken(token),
  });
  const response = (await db.select().from(schema.formResponses).where(eq(schema.formResponses.id, id)).limit(1))[0];
  return { response, token };
}

export async function getFormResponseByToken(token: string): Promise<FormResponseRow | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const rows = await getDb()
    .select()
    .from(schema.formResponses)
    .where(eq(schema.formResponses.accessTokenHash, await hashToken(token)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getFormResponse(organizationId: string, id: string): Promise<FormResponseRow | null> {
  const rows = await getDb()
    .select()
    .from(schema.formResponses)
    .where(and(eq(schema.formResponses.organizationId, organizationId), eq(schema.formResponses.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listProjectFormResponses(organizationId: string, projectId: string): Promise<FormResponseRow[]> {
  return getDb()
    .select()
    .from(schema.formResponses)
    .where(and(eq(schema.formResponses.organizationId, organizationId), eq(schema.formResponses.projectId, projectId)))
    .orderBy(sql`${schema.formResponses.submittedAt} IS NULL DESC`, sql`${schema.formResponses.createdAt} DESC`);
}

/** Store validated answers + timestamp. Idempotent: a second submit on the
 * same response is refused (the public page shows the thank-you state). */
export async function submitFormResponse(organizationId: string, id: string, answers: FormAnswers): Promise<{ ok: true } | { ok: false; error: "not_found" | "already_submitted" }> {
  const db = getDb();
  // Persist without the one-shot presign HMACs.
  const storable: FormAnswers = {
    answers: answers.answers,
    files: Object.fromEntries(Object.entries(answers.files).map(([k, f]) => [k, { key: f.key, name: f.name, bytes: f.bytes }])),
  };
  const result = await db
    .update(schema.formResponses)
    .set({ answers: JSON.stringify(storable), submittedAt: new Date() })
    .where(and(eq(schema.formResponses.organizationId, organizationId), eq(schema.formResponses.id, id), sql`${schema.formResponses.submittedAt} IS NULL`))
    .returning({ id: schema.formResponses.id });
  if (result.length) return { ok: true };
  const existing = await getFormResponse(organizationId, id);
  return existing ? { ok: false, error: "already_submitted" } : { ok: false, error: "not_found" };
}

/** Parse stored answers for display: [{label, value}] resolved against the
 * template's schema (labels survive field renames poorly on purpose — the
 * schema is the source of truth). */
export function unpackFormAnswers(answersJson: string | null | undefined, labels: Record<string, string>): Array<{ label: string; value: string }> {
  if (!answersJson) return [];
  try {
    const parsed = JSON.parse(answersJson) as { answers?: Record<string, string>; files?: Record<string, { name: string; key: string; bytes: number }> };
    const out: Array<{ label: string; value: string }> = [];
    for (const [id, value] of Object.entries(parsed.answers ?? {})) {
      if (typeof value !== "string") continue;
      if (value === "yes" || value === "no") {
        if (value === "no") continue; // unchecked boxes stay hidden
        out.push({ label: labels[id] ?? id, value: "Yes" });
      } else if (value) {
        out.push({ label: labels[id] ?? id, value });
      }
    }
    for (const [id, file] of Object.entries(parsed.files ?? {})) {
      if (file?.name) out.push({ label: labels[id] ?? "File", value: `${file.name} (${Math.round(file.bytes / 1024)} KB)` });
    }
    return out;
  } catch {
    return [];
  }
}
