/* Scoped integration tokens (WEB-186, Integrations 1/6) — the thin auth
 * every integration uses. The full public API is a later epic; this module
 * is deliberately the minimal token surface:
 *
 *   - raw token `snapit_<43 base64url chars>` (256-bit), returned exactly
 *     ONCE at mint time and never stored — the row keeps only the SHA-256
 *     hash (unique, the lookup key) plus a 14-char display prefix
 *   - scopes are ids from the catalog below (JSON array column); unknown or
 *     empty scope sets are rejected at creation, never coerced
 *   - revocation is soft (revoked_at): the Settings list keeps the history
 *     and a revoked token stops authenticating immediately
 *
 * Raw-token discipline mirrors the share-link tables (db-schema.ts header).
 * Tenant discipline: every function takes an organizationId — the studio
 * routes pass their org context; the bearer-auth path (lib/integrations/
 * auth.ts) derives it from the verified hash lookup. */
import { and, asc, eq, isNull } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";

/** Bearer tokens are recognizable on sight (`snapit_…`) and self-documenting
 * in logs without ever revealing the secret part. */
export const TOKEN_PREFIX = "snapit_";
/** Stored display prefix — enough to match a leaked token to its row by eye. */
export const PREFIX_LEN = 14;

/** The scope catalog stories 2–6 authenticate against. Later stories extend
 * this list; stored tokens keep working because scopes are matched by id. */
export const SCOPE_CATALOG = [
  { id: "galleries:read", label: "View galleries and collections" },
  { id: "galleries:write", label: "Create galleries and collections" },
  { id: "assets:read", label: "View photos and metadata" },
  { id: "assets:write", label: "Upload and publish photos" },
] as const;

export type IntegrationScope = (typeof SCOPE_CATALOG)[number]["id"];

const SCOPE_IDS: ReadonlySet<string> = new Set(SCOPE_CATALOG.map((s) => s.id));

export type IntegrationTokenRow = typeof schema.integrationTokens.$inferSelect;

/** Token row as the Settings surface may see it — never the hash. */
export type IntegrationTokenView = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

/* ---------------- validation ---------------- */

/** 1–80 chars after trimming; anything else is invalid (no coercion). */
export function normalizeName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, 80);
  return s.length >= 1 ? s : null;
}

/** Deduped, catalog-only scope set. Unknown id, non-array, or empty → null. */
export function normalizeScopes(v: unknown): IntegrationScope[] | null {
  if (!Array.isArray(v)) return null;
  const out: IntegrationScope[] = [];
  for (const s of v) {
    if (typeof s !== "string" || !SCOPE_IDS.has(s)) return null;
    if (!out.includes(s as IntegrationScope)) out.push(s as IntegrationScope);
  }
  return out.length ? out : null;
}

export function parseScopes(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === "string")
      : [];
  } catch {
    return [];
  }
}

/* ---------------- hashing ---------------- */

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/* ---------------- repo ---------------- */

/** Mint a token for an org. Returns the raw token exactly once — the caller
 * (studio route) shows it in the creation response and never again. */
export async function createIntegrationToken(input: {
  organizationId: string;
  name: string;
  scopes: IntegrationScope[];
}): Promise<{ token: string; row: IntegrationTokenRow }> {
  // 256 bits of CSPRNG entropy → base64url (43 chars, no padding, URL-safe).
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = TOKEN_PREFIX + b64url(bytes);
  const row = {
    id: crypto.randomUUID(),
    organizationId: input.organizationId,
    name: input.name,
    tokenHash: await sha256Hex(token),
    prefix: token.slice(0, PREFIX_LEN),
    scopes: JSON.stringify(input.scopes),
  };
  await getDb().insert(schema.integrationTokens).values(row);
  const saved = (
    await getDb()
      .select()
      .from(schema.integrationTokens)
      .where(eq(schema.integrationTokens.id, row.id))
      .limit(1)
  )[0];
  return { token, row: saved };
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Oldest → newest, live first (revoked rows sink but stay listed). */
export async function listIntegrationTokens(
  organizationId: string,
): Promise<IntegrationTokenView[]> {
  const rows = await getDb()
    .select()
    .from(schema.integrationTokens)
    .where(eq(schema.integrationTokens.organizationId, organizationId))
    .orderBy(
      asc(schema.integrationTokens.revokedAt),
      asc(schema.integrationTokens.createdAt),
    );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    scopes: parseScopes(r.scopes),
    createdAt: r.createdAt,
    lastUsedAt: r.lastUsedAt,
    revokedAt: r.revokedAt,
  }));
}

/** Soft-revoke. Cross-org or unknown id → false (no information leak). */
export async function revokeIntegrationToken(
  organizationId: string,
  tokenId: string,
): Promise<boolean> {
  const res = await getDb()
    .update(schema.integrationTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(schema.integrationTokens.id, tokenId),
        eq(schema.integrationTokens.organizationId, organizationId),
        isNull(schema.integrationTokens.revokedAt),
      ),
    )
    .returning({ id: schema.integrationTokens.id });
  return res.length > 0;
}

/** Resolve a raw bearer token to its live row (hash lookup; revoked rows and
 * unknown tokens are indistinguishable → null). */
export async function findLiveTokenByRaw(
  raw: string,
): Promise<IntegrationTokenRow | null> {
  if (!raw.startsWith(TOKEN_PREFIX) || raw.length !== TOKEN_PREFIX.length + 43)
    return null;
  const rows = await getDb()
    .select()
    .from(schema.integrationTokens)
    .where(
      and(
        eq(schema.integrationTokens.tokenHash, await sha256Hex(raw)),
        isNull(schema.integrationTokens.revokedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** last_used_at bookkeeping, throttled to one write per minute per token so
 * a busy integration doesn't turn every request into a D1 write. */
const TOUCH_THROTTLE_MS = 60_000;

export async function touchLastUsed(row: IntegrationTokenRow): Promise<void> {
  const last = row.lastUsedAt?.getTime() ?? 0;
  if (Date.now() - last < TOUCH_THROTTLE_MS) return;
  await getDb()
    .update(schema.integrationTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.integrationTokens.id, row.id));
}
