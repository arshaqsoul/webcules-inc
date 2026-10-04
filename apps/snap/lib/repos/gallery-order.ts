/* Gallery photo order - reads/writes share_grant_asset.position (lib/
 * gallery-order.ts has the pure math). Every write is org-scoped through the
 * grant row and flips share_grant.order_mode so the studio sees whether the
 * gallery is "sorted by X" or hand-arranged. */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb } from "../db";
import * as schema from "../db-schema";
import { exifCaptureDate } from "../exif";
import { getObject } from "../storage/service";
import { isValidColorKey } from "../color-sort";
import { planSet, type OrderItem, type OrderMode } from "../gallery-order";

/** Rows per UPDATE statement - the JSON bind parameter must stay well under D1's statement size limit. */
const WRITE_CHUNK = 500;

export type GrantOrderRow = OrderItem & { position: number; kind: string };

/** The gallery in its current order, with everything the sorts need. */
export async function getGrantOrder(grantId: string): Promise<GrantOrderRow[]> {
  const rows = await getDb()
    .select({
      id: schema.assets.id,
      filename: schema.assets.filename,
      kind: schema.assets.kind,
      createdAt: schema.assets.createdAt,
      capturedAt: schema.assets.capturedAt,
      colorKey: schema.assets.colorKey,
      folder: schema.shareGrantAssets.folderName,
      position: schema.shareGrantAssets.position,
    })
    .from(schema.shareGrantAssets)
    .innerJoin(schema.assets, eq(schema.assets.id, schema.shareGrantAssets.assetId))
    .where(eq(schema.shareGrantAssets.grantId, grantId))
    .orderBy(asc(schema.shareGrantAssets.position), asc(schema.assets.createdAt), asc(schema.assets.id));
  return rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    kind: r.kind,
    createdAtSec: Math.floor(r.createdAt.getTime() / 1000),
    capturedAtSec: r.capturedAt,
    colorKey: r.colorKey,
    folder: r.folder,
    position: r.position,
  }));
}

/** Write id → position pairs in as few statements as possible (one UPDATE
 * per chunk, driven by a JSON object bound as a single parameter). */
async function writePositions(grantId: string, positions: Map<string, number>): Promise<void> {
  const db = getDb();
  const entries = [...positions.entries()];
  for (let i = 0; i < entries.length; i += WRITE_CHUNK) {
    const chunk = JSON.stringify(Object.fromEntries(entries.slice(i, i + WRITE_CHUNK)));
    await db.run(
      sql`UPDATE share_grant_asset SET position = json_extract(${chunk}, '$."' || asset_id || '"') WHERE grant_id = ${grantId} AND asset_id IN (SELECT key FROM json_each(${chunk}))`,
    );
  }
}

async function setMode(grantId: string, mode: OrderMode): Promise<void> {
  await getDb().update(schema.shareGrants).set({ orderMode: mode }).where(eq(schema.shareGrants.id, grantId));
}

/** Save the arrangement a photographer ended on (Arrange → Done). One call
 * per editing session: sorting and dragging happen in the browser, and this
 * writes only the photos that actually moved (planSet) plus - only if it
 * changed - the gallery's order label. `ids` must be exactly the gallery's
 * photos. */
export async function setGrantOrder(params: {
  grantId: string;
  ids: string[];
  mode: OrderMode;
  /** The gallery's current label, so an unchanged label costs no write. */
  currentMode?: OrderMode | string;
}): Promise<{ ok: true; written: number; renumbered: boolean } | { ok: false; error: "mismatch" }> {
  const current = await getGrantOrder(params.grantId);
  const known = new Set(current.map((c) => c.id));
  const given = new Set(params.ids);
  if (params.ids.length !== current.length || given.size !== params.ids.length || params.ids.some((id) => !known.has(id))) {
    return { ok: false, error: "mismatch" };
  }
  const plan = planSet(current, params.ids);
  if (plan.positions.size) await writePositions(params.grantId, plan.positions);
  // "custom" when the order was hand-made, a sort's name while it still is one.
  if (params.mode !== params.currentMode) await setMode(params.grantId, params.mode);
  return { ok: true, written: plan.positions.size, renumbered: plan.renumbered };
}

/* ---------------- sort metadata (capture date + color) ---------------- */

/** First bytes of an object are enough for EXIF (JPEG APP1 / TIFF IFDs). */
const EXIF_PROBE_BYTES = 256 * 1024;

/** Read + store the EXIF capture time for one asset. -1 = no date found, so
 * it is never re-scanned. Best effort: never throws. */
export async function scanCapturedAt(organizationId: string, asset: { id: string; storageKey: string; kind: string }): Promise<number> {
  let value = -1;
  try {
    if (asset.kind === "image" || asset.kind === "raw") {
      const object = await getObject(organizationId, asset.storageKey, { offset: 0, length: EXIF_PROBE_BYTES });
      if (object) value = exifCaptureDate(await new Response(object.body).arrayBuffer()) ?? -1;
    }
  } catch (err) {
    console.error("capture date scan failed:", String(err));
  }
  await getDb()
    .update(schema.assets)
    .set({ capturedAt: value })
    .where(and(eq(schema.assets.id, asset.id), eq(schema.assets.organizationId, organizationId)));
  return value;
}

/** Backfill capture dates for one project's unscanned photos, a bounded
 * batch per call. Returns how many are still unscanned. */
export async function backfillCapturedAt(organizationId: string, projectId: string, batch = 60): Promise<{ scanned: number; remaining: number }> {
  const db = getDb();
  const pending = await db
    .select({ id: schema.assets.id, storageKey: schema.assets.storageKey, kind: schema.assets.kind })
    .from(schema.assets)
    .where(and(eq(schema.assets.organizationId, organizationId), eq(schema.assets.projectId, projectId), isNull(schema.assets.capturedAt)))
    .limit(batch);
  for (const asset of pending) await scanCapturedAt(organizationId, asset);
  const left = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.assets)
    .where(and(eq(schema.assets.organizationId, organizationId), eq(schema.assets.projectId, projectId), isNull(schema.assets.capturedAt)));
  return { scanned: pending.length, remaining: left[0]?.n ?? 0 };
}

/** Store browser-computed color keys (org-scoped, validated). */
export async function saveColorKeys(organizationId: string, items: { id: string; key: number }[]): Promise<number> {
  const db = getDb();
  let saved = 0;
  for (const item of items.slice(0, 500)) {
    if (!isValidColorKey(item.key)) continue;
    const res = await db
      .update(schema.assets)
      .set({ colorKey: item.key })
      .where(and(eq(schema.assets.id, item.id), eq(schema.assets.organizationId, organizationId)))
      .returning({ id: schema.assets.id });
    saved += res.length;
  }
  return saved;
}

/** Photos in a grant that still need a color key (the browser analyses these). */
export async function grantAssetsMissingColor(grantId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ id: schema.assets.id })
    .from(schema.shareGrantAssets)
    .innerJoin(schema.assets, eq(schema.assets.id, schema.shareGrantAssets.assetId))
    .where(and(eq(schema.shareGrantAssets.grantId, grantId), isNull(schema.assets.colorKey), inArray(schema.assets.kind, ["image", "video"])));
  return rows.map((r) => r.id);
}
