/* Per-photo share tokens (WEB-262) — children of the gallery grant.
 * Same crypto as grant tokens (256-bit urlsafe, SHA-256 lookup, AES-GCM
 * re-encryption), but resolution ALWAYS walks the parent: a revoked,
 * expired, regenerated, or sharing-disabled gallery kills every photo link
 * created from it. Creation is capped per grant per day (normal use is a
 * handful; the cap only stops loops). */
import { and, eq, gte, sql } from "drizzle-orm";

import { getDb } from "../db";
import * as schema from "../db-schema";
import { decryptToken, encryptToken, hashToken, mintToken } from "./grants";

export type PhotoShareRow = typeof schema.photoShares.$inferSelect;

/** Normal sharing cadence; generous by design. */
export const PHOTO_SHARES_PER_DAY = 100;

export async function recentPhotoShareCount(grantId: string): Promise<number> {
  const rows = await getDb()
    .select({ n: sql<number>`count(*)` })
    .from(schema.photoShares)
    .where(and(eq(schema.photoShares.grantId, grantId), gte(schema.photoShares.createdAt, new Date(Date.now() - 86400_000))));
  return rows[0]?.n ?? 0;
}

/** Mint a child token. Expiry: min(30 days, the gallery's own expiry). */
export async function createPhotoShare(params: {
  organizationId: string;
  grantId: string;
  assetId: string;
  grantExpiresAt: Date | null;
}): Promise<{ ok: true; token: string; row: PhotoShareRow } | { ok: false; error: "rate_limited" }> {
  if ((await recentPhotoShareCount(params.grantId)) >= PHOTO_SHARES_PER_DAY) {
    return { ok: false, error: "rate_limited" };
  }
  const token = mintToken();
  const maxTtl = 30 * 86400_000;
  const expiresAt = params.grantExpiresAt
    ? new Date(Math.min(Date.now() + maxTtl, params.grantExpiresAt.getTime()))
    : new Date(Date.now() + maxTtl);
  const row: typeof schema.photoShares.$inferInsert = {
    id: crypto.randomUUID(),
    organizationId: params.organizationId,
    grantId: params.grantId,
    assetId: params.assetId,
    tokenHash: await hashToken(token),
    tokenEnc: await encryptToken(token),
    expiresAt,
  };
  await getDb().insert(schema.photoShares).values(row);
  return { ok: true, token, row: row as PhotoShareRow };
}

export type ResolvedPhotoShare = {
  share: PhotoShareRow;
  grant: typeof schema.shareGrants.$inferSelect;
  asset: typeof schema.assets.$inferSelect;
};

/** Resolve by token with the full parent-grant kill chain: parent must be
 * active, unexpired, sharing-enabled, and the photo token itself unexpired
 * and its asset still in the grant's delivered set. */
export async function resolvePhotoShare(token: string): Promise<ResolvedPhotoShare | null> {
  const rows = await getDb()
    .select()
    .from(schema.photoShares)
    .where(eq(schema.photoShares.tokenHash, await hashToken(token)))
    .limit(1);
  const share = rows[0];
  if (!share) return null;
  return resolvePhotoShareByRow(share);
}

/** The kill chain for an already-loaded row (used by token + row-id paths). */
export async function resolvePhotoShareByRow(share: PhotoShareRow): Promise<ResolvedPhotoShare | null> {
  const db = getDb();
  if (share.expiresAt.getTime() <= Date.now()) return null;

  const grantRows = await db.select().from(schema.shareGrants).where(eq(schema.shareGrants.id, share.grantId)).limit(1);
  const grant = grantRows[0];
  if (!grant) return null;
  if (grant.status !== "active") return null; // revoked / regenerated
  if (!grant.allowSharing) return null; // kill-switch
  if (grant.expiresAt && grant.expiresAt.getTime() <= Date.now()) return null;

  const assetRows = await db.select().from(schema.assets).where(eq(schema.assets.id, share.assetId)).limit(1);
  const asset = assetRows[0];
  if (!asset || asset.organizationId !== grant.organizationId) return null;

  const inSet = await db
    .select({ assetId: schema.shareGrantAssets.assetId })
    .from(schema.shareGrantAssets)
    .where(and(eq(schema.shareGrantAssets.grantId, grant.id), eq(schema.shareGrantAssets.assetId, asset.id)))
    .limit(1);
  if (!inSet.length) return null;

  return { share, grant, asset };
}

/** Token again for a known row (share-again flows). */
export async function photoShareToken(row: PhotoShareRow): Promise<string | null> {
  return decryptToken(row.tokenEnc);
}
