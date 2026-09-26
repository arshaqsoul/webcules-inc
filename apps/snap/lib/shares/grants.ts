/* Share-grant engine — secure client galleries. A grant is an org+project
 * scoped capability addressed by a 256-bit URL token. Only two derived forms
 * are persisted: the SHA-256 hash (lookup + uniqueness — a D1 leak never
 * yields a working link) and an AES-GCM encryption of the token
 * (BETTER_AUTH_SECRET-derived key) so the SAME link can be re-emailed without
 * regenerating. Plaintext token exists only in the HTTP response + email. */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";

const TOKEN_BYTES = 32; // 256-bit
const TOKEN_TTL_MS = 365 * 24 * 3600 * 1000; // sanity ceiling for expiry picks

/* ---------------- Token primitives ---------------- */

export function mintToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function tokenKey(): Promise<CryptoKey> {
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET not configured — cannot protect share tokens");
  const hkdf = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode("snap:share-token:v1") },
    hkdf,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptToken(token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await tokenKey(), new TextEncoder().encode(token)),
  );
  const out = new Uint8Array(iv.length + cipher.length);
  out.set(iv, 0);
  out.set(cipher, iv.length);
  return btoa(String.fromCharCode(...out));
}

async function decryptToken(enc: string): Promise<string | null> {
  try {
    const bin = atob(enc);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, 12) },
      await tokenKey(),
      bytes.slice(12),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null; // wrong key (secret rotated) or tampered column
  }
}

/* ---------------- State model ---------------- */

export type GrantState = "active" | "expiring_soon" | "expired" | "revoked" | "regenerated";

export type GrantLike = { status: string; expiresAt: Date | null };

/** The single predicate for "this grant may serve media / protects its assets".
 * Expiry is derived per-request — no cron needed to flip rows. */
export function grantIsEffectivelyActive(grant: GrantLike): boolean {
  return grant.status === "active" && (!grant.expiresAt || grant.expiresAt.getTime() > Date.now());
}

export function grantState(grant: GrantLike): GrantState {
  if (grant.status === "revoked") return "revoked";
  if (grant.status === "regenerated") return "regenerated";
  if (grant.expiresAt) {
    const msLeft = grant.expiresAt.getTime() - Date.now();
    if (msLeft <= 0) return "expired";
    if (msLeft < 7 * 24 * 3600 * 1000) return "expiring_soon";
  }
  return "active";
}

/* ---------------- Grant CRUD ---------------- */

export async function createShareGrant(params: {
  organizationId: string;
  projectId: string;
  clientEmail: string;
  assetIds: string[];
  expiresAt: Date | null;
  createdById: string;
  allowDownload?: boolean;
}): Promise<
  | { ok: true; grantId: string; token: string }
  | { ok: false; error: "no_assets" | "asset_mismatch" }
> {
  const db = getDb();
  if (!params.assetIds.length) return { ok: false, error: "no_assets" };

  const owned = await db
    .select({ id: schema.assets.id })
    .from(schema.assets)
    .where(
      and(
        eq(schema.assets.organizationId, params.organizationId),
        eq(schema.assets.projectId, params.projectId),
        inArray(schema.assets.id, params.assetIds),
      ),
    );
  if (owned.length !== params.assetIds.length) return { ok: false, error: "asset_mismatch" };

  const token = mintToken();
  const tokenHash = await hashToken(token);
  const tokenEnc = await encryptToken(token);
  const grantId = crypto.randomUUID();

  // Grant row first — grant-assets carry the FK.
  await db.insert(schema.shareGrants).values({
    id: grantId,
    organizationId: params.organizationId,
    projectId: params.projectId,
    clientEmail: params.clientEmail,
    tokenHash,
    tokenEnc,
    status: "active",
    expiresAt: params.expiresAt,
    createdById: params.createdById,
    allowDownload: params.allowDownload ?? true,
  });
  for (const assetId of params.assetIds) {
    await db.insert(schema.shareGrantAssets).values({ grantId, assetId });
  }
  await db
    .update(schema.assets)
    .set({ status: "shared" })
    .where(
      and(eq(schema.assets.organizationId, params.organizationId), inArray(schema.assets.id, params.assetIds)),
    );
  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: params.organizationId,
    actorType: "user",
    actorId: params.createdById,
    action: "share.grant.created",
    targetType: "project",
    targetId: params.projectId,
    meta: JSON.stringify({ grantId, assets: params.assetIds.length, expiresAt: params.expiresAt?.toISOString() ?? null }),
  });

  return { ok: true, grantId, token };
}

export async function getShareGrant(
  organizationId: string,
  grantId: string,
): Promise<typeof schema.shareGrants.$inferSelect | null> {
  const db = getDb();
  return (
    await db
      .select()
      .from(schema.shareGrants)
      .where(and(eq(schema.shareGrants.id, grantId), eq(schema.shareGrants.organizationId, organizationId)))
      .limit(1)
  )[0] ?? null;
}

/** Grant by id with NO org scope — internal use only where the grant itself
 * is the security boundary (validated gallery cookie / token-hash match). */
export async function getGrantById(grantId: string): Promise<typeof schema.shareGrants.$inferSelect | null> {
  const db = getDb();
  return (
    await db.select().from(schema.shareGrants).where(eq(schema.shareGrants.id, grantId)).limit(1)
  )[0] ?? null;
}

/** Grant by token hash regardless of lifecycle state — lets the gallery
 * render a BRANDED denial (studio name/contact) for dead-but-known links
 * without leaking anything about other grants. */
export async function getGrantByTokenHashAny(token: string): Promise<typeof schema.shareGrants.$inferSelect | null> {
  const db = getDb();
  return (
    await db
      .select()
      .from(schema.shareGrants)
      .where(eq(schema.shareGrants.tokenHash, await hashToken(token)))
      .limit(1)
  )[0] ?? null;
}

/** Is this asset part of this grant's set? (Used by the proxy's gallery path.) */
export async function assetInGrant(grantId: string, assetId: string): Promise<boolean> {
  const db = getDb();
  return (
    await db
      .select({ assetId: schema.shareGrantAssets.assetId })
      .from(schema.shareGrantAssets)
      .where(and(eq(schema.shareGrantAssets.grantId, grantId), eq(schema.shareGrantAssets.assetId, assetId)))
      .limit(1)
  ).length > 0;
}

/** All grants for a project with per-grant asset counts, derived states, and
 * access summaries (views/downloads/last opened — WEB-129). */
export async function listProjectGrants(organizationId: string, projectId: string) {
  const db = getDb();
  const grants = await db
    .select()
    .from(schema.shareGrants)
    .where(and(eq(schema.shareGrants.organizationId, organizationId), eq(schema.shareGrants.projectId, projectId)))
    .orderBy(desc(schema.shareGrants.createdAt));

  const counts = new Map<string, number>();
  const activity = new Map<string, { views: number; downloads: number; lastViewedAt: Date | null }>();
  if (grants.length) {
    const grantIds = grants.map((g) => g.id);
    const [assetRows, aggRows] = await Promise.all([
      db
        .select({ grantId: schema.shareGrantAssets.grantId, assetId: schema.shareGrantAssets.assetId })
        .from(schema.shareGrantAssets)
        .where(inArray(schema.shareGrantAssets.grantId, grantIds)),
      db
        .select({
          grantId: schema.shareAccessLogs.grantId,
          event: schema.shareAccessLogs.event,
          n: sql<number>`count(*)`,
          last: sql<number | null>`max(${schema.shareAccessLogs.createdAt})`,
        })
        .from(schema.shareAccessLogs)
        .where(inArray(schema.shareAccessLogs.grantId, grantIds))
        .groupBy(schema.shareAccessLogs.grantId, schema.shareAccessLogs.event),
    ]);
    for (const r of assetRows) counts.set(r.grantId, (counts.get(r.grantId) ?? 0) + 1);
    for (const r of aggRows) {
      const cur = activity.get(r.grantId) ?? { views: 0, downloads: 0, lastViewedAt: null };
      if (r.event === "view") {
        cur.views = r.n;
        if (r.last) cur.lastViewedAt = new Date(r.last * 1000);
      }
      if (r.event === "download") cur.downloads = r.n;
      activity.set(r.grantId, cur);
    }
  }

  return grants.map((g) => {
    const a = activity.get(g.id) ?? { views: 0, downloads: 0, lastViewedAt: null };
    return {
      id: g.id,
      clientEmail: g.clientEmail,
      status: g.status,
      state: grantState(g),
      expiresAt: g.expiresAt ? g.expiresAt.toISOString() : null,
      createdAt: g.createdAt.toISOString(),
      assetCount: counts.get(g.id) ?? 0,
      allowDownload: g.allowDownload,
      views: a.views,
      downloads: a.downloads,
      lastViewedAt: a.lastViewedAt ? a.lastViewedAt.toISOString() : null,
    };
  });
}

/** Recent gallery access events across a project's grants (WEB-129 feed). */
export async function getProjectShareActivity(organizationId: string, projectId: string, limit = 40) {  const db = getDb();
  const grants = await db
    .select({ id: schema.shareGrants.id, clientEmail: schema.shareGrants.clientEmail })
    .from(schema.shareGrants)
    .where(and(eq(schema.shareGrants.organizationId, organizationId), eq(schema.shareGrants.projectId, projectId)));
  if (!grants.length) return [];
  const emailByGrant = new Map(grants.map((g) => [g.id, g.clientEmail]));

  const rows = await db
    .select({
      id: schema.shareAccessLogs.id,
      grantId: schema.shareAccessLogs.grantId,
      event: schema.shareAccessLogs.event,
      createdAt: schema.shareAccessLogs.createdAt,
    })
    .from(schema.shareAccessLogs)
    .where(inArray(schema.shareAccessLogs.grantId, Array.from(emailByGrant.keys())))
    .orderBy(desc(schema.shareAccessLogs.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    clientEmail: emailByGrant.get(r.grantId) ?? "",
    event: r.event,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Reveal the still-working token of a grant (for re-email). Null when the
 * grant is superseded/revoked or the ciphertext no longer decrypts. */
export async function getGrantToken(
  grant: typeof schema.shareGrants.$inferSelect,
): Promise<string | null> {
  if (!grantIsEffectivelyActive(grant) || !grant.tokenEnc) return null;
  return decryptToken(grant.tokenEnc);
}

export async function revokeShareGrant(params: {
  organizationId: string;
  grantId: string;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: "not_found" | "inactive" }> {
  const db = getDb();
  const grant = await getShareGrant(params.organizationId, params.grantId);
  if (!grant) return { ok: false, error: "not_found" };
  if (grant.status !== "active") return { ok: false, error: "inactive" };

  await db
    .update(schema.shareGrants)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(eq(schema.shareGrants.id, grant.id));
  await refreshSharedStatuses(params.organizationId, grant.id);
  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: params.organizationId,
    actorType: "user",
    actorId: params.actorUserId,
    action: "share.grant.revoked",
    targetType: "share_grant",
    targetId: grant.id,
    meta: JSON.stringify({ projectId: grant.projectId }),
  });
  return { ok: true };
}

/** Mint a fresh token: the old grant flips to `regenerated` (dead immediately)
 * and a new grant inherits its asset set, email, and expiry. */
export async function regenerateShareGrant(params: {
  organizationId: string;
  grantId: string;
  expiresAt?: Date | null;
  actorUserId: string;
}): Promise<
  | { ok: true; grantId: string; token: string }
  | { ok: false; error: "not_found" | "superseded" }
> {
  const db = getDb();
  const old = await getShareGrant(params.organizationId, params.grantId);
  if (!old) return { ok: false, error: "not_found" };
  if (old.status === "regenerated") return { ok: false, error: "superseded" };

  const assetRows = await db
    .select({ assetId: schema.shareGrantAssets.assetId })
    .from(schema.shareGrantAssets)
    .where(eq(schema.shareGrantAssets.grantId, old.id));

  const token = mintToken();
  const tokenHash = await hashToken(token);
  const tokenEnc = await encryptToken(token);
  const newId = crypto.randomUUID();
  const expiresAt = params.expiresAt !== undefined ? params.expiresAt : old.expiresAt;

  await db.update(schema.shareGrants).set({ status: "regenerated" }).where(eq(schema.shareGrants.id, old.id));
  await db.insert(schema.shareGrants).values({
    id: newId,
    organizationId: old.organizationId,
    projectId: old.projectId,
    clientEmail: old.clientEmail,
    tokenHash,
    tokenEnc,
    status: "active",
    expiresAt,
    parentGrantId: old.id,
    createdById: params.actorUserId,
    allowDownload: old.allowDownload,
  });
  for (const row of assetRows) {
    await db.insert(schema.shareGrantAssets).values({ grantId: newId, assetId: row.assetId });
  }
  await db
    .update(schema.assets)
    .set({ status: "shared" })
    .where(
      and(
        eq(schema.assets.organizationId, old.organizationId),
        inArray(
          schema.assets.id,
          assetRows.map((r) => r.assetId),
        ),
      ),
    );
  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: old.organizationId,
    actorType: "user",
    actorId: params.actorUserId,
    action: "share.grant.regenerated",
    targetType: "share_grant",
    targetId: newId,
    meta: JSON.stringify({ supersededGrantId: old.id, projectId: old.projectId }),
  });

  return { ok: true, grantId: newId, token };
}

export async function setShareGrantExpiry(params: {
  organizationId: string;
  grantId: string;
  expiresAt: Date | null;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: "not_found" | "inactive" }> {
  const db = getDb();
  const grant = await getShareGrant(params.organizationId, params.grantId);
  if (!grant) return { ok: false, error: "not_found" };
  if (grant.status !== "active") return { ok: false, error: "inactive" };

  await db
    .update(schema.shareGrants)
    .set({ expiresAt: params.expiresAt })
    .where(eq(schema.shareGrants.id, grant.id));
  await refreshSharedStatuses(params.organizationId, grant.id);
  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: params.organizationId,
    actorType: "user",
    actorId: params.actorUserId,
    action: "share.grant.expiry_updated",
    targetType: "share_grant",
    targetId: grant.id,
    meta: JSON.stringify({ expiresAt: params.expiresAt?.toISOString() ?? null }),
  });
  return { ok: true };
}

/** Token-addressed lookup for /g/{token} + the asset proxy. Runs through the
 * hash (high-entropy random key — no enumeration surface) and re-checks
 * status + expiry on EVERY call. */
export async function resolveGrantByToken(
  token: string,
): Promise<typeof schema.shareGrants.$inferSelect | null> {
  const db = getDb();
  const grant = (
    await db
      .select()
      .from(schema.shareGrants)
      .where(eq(schema.shareGrants.tokenHash, await hashToken(token)))
      .limit(1)
  )[0] ?? null;
  return grant && grantIsEffectivelyActive(grant) ? grant : null;
}

/** Assets in a grant (org re-verified via the grant row's org). */
export async function getGrantAssets(grant: typeof schema.shareGrants.$inferSelect) {
  const db = getDb();
  return db
    .select()
    .from(schema.assets)
    .innerJoin(schema.shareGrantAssets, eq(schema.shareGrantAssets.assetId, schema.assets.id))
    .where(eq(schema.shareGrantAssets.grantId, grant.id))
    .orderBy(schema.assets.createdAt)
    .then((rows) => rows.map((r) => r.asset));
}

/** After a grant ends (revoked / superseded / expired), recompute 'shared'
 * flags: an asset keeps the lock only while another effectively-active grant
 * still includes it; otherwise it reverts to 'approved'. */
async function refreshSharedStatuses(organizationId: string, grantId: string): Promise<void> {
  const db = getDb();
  // All grant memberships of every asset in this grant (other grants may
  // still keep an asset shared).
  const memberships = await db
    .select({ assetId: schema.shareGrantAssets.assetId })
    .from(schema.shareGrantAssets)
    .where(eq(schema.shareGrantAssets.grantId, grantId));
  const assetIds = memberships.map((m) => m.assetId);
  if (!assetIds.length) return;

  const rows = await db
    .select({
      assetId: schema.shareGrantAssets.assetId,
      status: schema.shareGrants.status,
      expiresAt: schema.shareGrants.expiresAt,
    })
    .from(schema.shareGrantAssets)
    .innerJoin(schema.shareGrants, eq(schema.shareGrants.id, schema.shareGrantAssets.grantId))
    .where(inArray(schema.shareGrantAssets.assetId, assetIds));

  const stillShared = new Set(
    rows.filter((r) => grantIsEffectivelyActive(r)).map((r) => r.assetId),
  );
  const revert = assetIds.filter((id) => !stillShared.has(id));
  if (revert.length) {
    await db
      .update(schema.assets)
      .set({ status: "approved" })
      .where(
        and(
          eq(schema.assets.organizationId, organizationId),
          eq(schema.assets.status, "shared"),
          inArray(schema.assets.id, revert),
        ),
      );
  }
}

/** Valid expiry input: null (never) or a future instant within 1y. */
export function normalizeExpiry(days: unknown):
  | { ok: true; expiresAt: Date | null }
  | { ok: false; error: "invalid_expiry" } {
  if (days == null) return { ok: true, expiresAt: null };
  if (typeof days !== "number" || !Number.isFinite(days)) return { ok: false, error: "invalid_expiry" };
  const ms = days * 24 * 3600 * 1000;
  if (ms <= 0 || ms > TOKEN_TTL_MS) return { ok: false, error: "invalid_expiry" };
  return { ok: true, expiresAt: new Date(Date.now() + ms) };
}

/** Studio-wide grant list with project titles — the Galleries overview page. */
export async function listStudioGrants(organizationId: string, limit = 100) {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.shareGrants.id,
      projectId: schema.shareGrants.projectId,
      projectTitle: schema.projects.title,
      clientEmail: schema.shareGrants.clientEmail,
      status: schema.shareGrants.status,
      expiresAt: schema.shareGrants.expiresAt,
      createdAt: schema.shareGrants.createdAt,
      allowDownload: schema.shareGrants.allowDownload,
    })
    .from(schema.shareGrants)
    .leftJoin(schema.projects, eq(schema.projects.id, schema.shareGrants.projectId))
    .where(eq(schema.shareGrants.organizationId, organizationId))
    .orderBy(desc(schema.shareGrants.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    projectTitle: r.projectTitle ?? "—",
    clientEmail: r.clientEmail,
    state: grantState({ status: r.status, expiresAt: r.expiresAt }),
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    allowDownload: r.allowDownload,
  }));
}
