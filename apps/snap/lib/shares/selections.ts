/* Client favorites & selections (WEB-209 P1) — the client-side half of the
 * gallery. Favorites are a simple per-grant heart set; selections are a
 * limited, optionally deadlined pick list that replaces itself on
 * resubmission (latest wins). Both are scoped to the grant and re-verify
 * asset membership before writing. */
import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { assetInGrant } from "@/lib/shares/grants";

type Grant = typeof schema.shareGrants.$inferSelect;

export function selectionOpen(grant: Grant): boolean {
  if (!grant.selectionDeadline) return true;
  return grant.selectionDeadline * 1000 > Date.now();
}

export async function getFavorites(grantId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ assetId: schema.galleryFavorites.assetId })
    .from(schema.galleryFavorites)
    .where(eq(schema.galleryFavorites.grantId, grantId));
  return rows.map((r) => r.assetId);
}

/** Heart toggle — allowed in favorites AND selection mode (hearts are free,
 * picks are counted). No-ops (double insert / missing row) resolve cleanly. */
export async function toggleFavorite(grant: Grant, assetId: string): Promise<{ favorited: boolean }> {
  const db = getDb();
  if (!(await assetInGrant(grant.id, assetId))) return { favorited: false };
  const existing = await db
    .select({ assetId: schema.galleryFavorites.assetId })
    .from(schema.galleryFavorites)
    .where(and(eq(schema.galleryFavorites.grantId, grant.id), eq(schema.galleryFavorites.assetId, assetId)))
    .limit(1);
  if (existing.length) {
    await db
      .delete(schema.galleryFavorites)
      .where(and(eq(schema.galleryFavorites.grantId, grant.id), eq(schema.galleryFavorites.assetId, assetId)));
    return { favorited: false };
  }
  await db.insert(schema.galleryFavorites).values({
    grantId: grant.id,
    assetId,
    organizationId: grant.organizationId,
  });
  return { favorited: true };
}

/** WEB-263: idempotent set (offline queue replay) — add or remove to
 * reach the desired state; membership verified like the toggle. */
export async function setFavorite(grant: Grant, assetId: string, favorited: boolean): Promise<{ favorited: boolean }> {
  const db = getDb();
  if (!(await assetInGrant(grant.id, assetId))) return { favorited: false };
  if (favorited) {
    await db
      .insert(schema.galleryFavorites)
      .values({ grantId: grant.id, assetId, organizationId: grant.organizationId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(schema.galleryFavorites)
      .where(and(eq(schema.galleryFavorites.grantId, grant.id), eq(schema.galleryFavorites.assetId, assetId)));
  }
  return { favorited };
}

export async function getLatestSelection(
  grantId: string,
): Promise<{ items: string[]; note: string | null; submittedAt: Date; clientEmail: string } | null> {
  const rows = await getDb()
    .select()
    .from(schema.gallerySelections)
    .where(eq(schema.gallerySelections.grantId, grantId))
    .orderBy(desc(schema.gallerySelections.submittedAt))
    .limit(1);
  if (!rows.length) return null;
  const r = rows[0];
  let items: string[] = [];
  try {
    const parsed = JSON.parse(r.itemsJson) as unknown;
    if (Array.isArray(parsed)) items = parsed.filter((x): x is string => typeof x === "string");
  } catch {
    /* empty selection */
  }
  return { items, note: r.note, submittedAt: r.submittedAt, clientEmail: r.clientEmail };
}

/** Submit (or replace) the pick list. Validates mode, deadline, membership
 * and the limit — the client UI mirrors these, the server is the gate. */
export async function submitSelection(
  grant: Grant,
  assetIds: string[],
  note: string | null,
): Promise<{ ok: true; count: number } | { ok: false; error: string; status: number }> {
  if (grant.selectionMode !== "selection") return { ok: false, error: "selection_disabled", status: 409 };
  if (!selectionOpen(grant)) return { ok: false, error: "deadline_passed", status: 409 };
  const ids = Array.from(new Set(assetIds));
  if (!ids.length) return { ok: false, error: "empty_selection", status: 400 };
  if (grant.selectionLimit && ids.length > grant.selectionLimit) {
    return { ok: false, error: "limit_exceeded", status: 400 };
  }
  // every pick must belong to this grant's set
  const rows = await getDb()
    .select({ assetId: schema.shareGrantAssets.assetId })
    .from(schema.shareGrantAssets)
    .where(and(eq(schema.shareGrantAssets.grantId, grant.id), inArray(schema.shareGrantAssets.assetId, ids)));
  if (rows.length !== ids.length) return { ok: false, error: "asset_not_in_gallery", status: 400 };

  const db = getDb();
  // latest-wins: drop earlier submissions for this grant, keep exactly one row
  await db.batch([
    db.delete(schema.gallerySelections).where(eq(schema.gallerySelections.grantId, grant.id)),
    db.insert(schema.gallerySelections).values({
      id: crypto.randomUUID(),
      organizationId: grant.organizationId,
      grantId: grant.id,
      clientEmail: grant.clientEmail,
      note: note?.slice(0, 2000) ?? null,
      itemsJson: JSON.stringify(rows.map((r) => r.assetId)),
    }),
  ]);
  return { ok: true, count: ids.length };
}
