/* Gallery view rate limiting (WEB-160) — bounds the viral-gallery flood
 * cliff: per-IP 30 image views/min + per-gallery ~5M views/month (≈1,667
 * full-gallery visits/day; real users never hit it). Counters are upserted
 * in D1 (one row per IP-minute and per grant-month) so enforcement costs one
 * write per view; the monthly table doubles as the per-org usage rollup that
 * margin monitoring (WEB-161) reads.
 *
 * Enforcement returns 429s for image GETs (the gallery client backs off and
 * retries) and a friendly "paused" state for an over-budget gallery page —
 * humans never see a broken gallery. */
import { sql } from "drizzle-orm";

import { getDb } from "./db";

export const IP_VIEWS_PER_MIN = 30;
export const GALLERY_MONTHLY_VIEW_BUDGET = 5_000_000;
/** 429 Retry-After (also the client backoff base). */
export const VIEW_RETRY_AFTER_S = 30;

function minuteWindow(now = Math.floor(Date.now() / 1000)): number {
  return Math.floor(now / 60) * 60;
}
function monthKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type ViewCheck = { ok: true } | { ok: false; reason: "ip" | "budget"; retryAfterS: number };

/** Atomically increment the IP window + gallery month counters and report
 * whether the view is allowed. Over-limit increments are still recorded
 * (they measure pressure) but the request is refused. */
export async function checkImageView(ip: string, organizationId: string, grantId: string): Promise<ViewCheck> {
  const db = getDb();
  const windowStart = minuteWindow();

  const ipRows = await db.all<{ count: number }>(sql`
    INSERT INTO view_rate_window (ip, window_start, count) VALUES (${ip}, ${windowStart}, 1)
    ON CONFLICT (ip, window_start) DO UPDATE SET count = count + 1
    RETURNING count
  `);
  if ((ipRows[0]?.count ?? 0) > IP_VIEWS_PER_MIN) {
    return { ok: false, reason: "ip", retryAfterS: VIEW_RETRY_AFTER_S };
  }

  const monthRows = await db.all<{ views: number }>(sql`
    INSERT INTO gallery_view_monthly (organization_id, grant_id, month, views) VALUES (${organizationId}, ${grantId}, ${monthKey()}, 1)
    ON CONFLICT (organization_id, grant_id, month) DO UPDATE SET views = views + 1
    RETURNING views
  `);
  if ((monthRows[0]?.views ?? 0) > GALLERY_MONTHLY_VIEW_BUDGET) {
    return { ok: false, reason: "budget", retryAfterS: VIEW_RETRY_AFTER_S };
  }
  return { ok: true };
}

/** WEB-443: does this serve hit the per-IP view limiter? Grid thumbs are
 * exempt — one gallery page loads EVERY thumb at once, so a 30/min per-IP
 * image cap 429'd everything past photo 30 and the client's cache-busting
 * retries (&r=) made it worse. Full-size serves (lightbox previews,
 * originals, downloads — even a ?variant=thumb WITH download=1, which is a
 * deliberate byte fetch, not a grid tile) stay limited. The monthly budget
 * still applies to thumbs at the page level via countGalleryOpen. */
export function viewLimiterApplies(variant: string | null, wantsDownload: boolean): boolean {
  return wantsDownload || variant !== "thumb";
}

/** WEB-443: batched per-photo interest counter — ONE aggregate statement per
 * gallery page load (scheduled via ctx.waitUntil by the gallery page)
 * instead of one write per thumb GET. Counts a view for every asset in the
 * grant's delivered set; heat-overlay semantics are unchanged (a gallery
 * open = one view per delivered photo, which is what the eager thumb grid
 * always produced). */
export async function countGalleryAssetViews(organizationId: string, grantId: string): Promise<void> {
  try {
    const db = getDb();
    await db.all(sql`
      INSERT INTO asset_view_monthly (organization_id, grant_id, asset_id, month, views)
      SELECT ${organizationId}, ${grantId}, sga.asset_id, ${monthKey()}, 1
      FROM share_grant_asset sga WHERE sga.grant_id = ${grantId}
      ON CONFLICT (organization_id, grant_id, asset_id, month) DO UPDATE SET views = views + 1
    `);
  } catch (err) {
    console.error("batched asset view counter failed:", String(err)); // analytics must never break serving
  }
}

/** WEB-265: per-photo interest counter (heat overlay) — full-size serves
 * only since WEB-443 (grid thumbs are batched per page load above). */
export async function countAssetView(organizationId: string, grantId: string, assetId: string): Promise<void> {
  try {
    const db = getDb();
    await db.all(sql`
      INSERT INTO asset_view_monthly (organization_id, grant_id, asset_id, month, views)
      VALUES (${organizationId}, ${grantId}, ${assetId}, ${monthKey()}, 1)
      ON CONFLICT (organization_id, grant_id, asset_id, month) DO UPDATE SET views = views + 1
    `);
  } catch (err) {
    console.error("asset view counter failed:", String(err)); // analytics must never break serving
  }
}

/** All-time per-asset view totals for a grant's delivered set (aggregates,
 * not row scans — the heat overlay source). */
export async function assetViewTotals(grantId: string): Promise<Map<string, number>> {
  const db = getDb();
  const rows = await db.all<{ asset_id: string; n: number }>(sql`
    SELECT asset_id, SUM(views) AS n FROM asset_view_monthly WHERE grant_id = ${grantId} GROUP BY asset_id
  `);
  return new Map(rows.map((r) => [r.asset_id, r.n]));
}

/** Gallery page open — counts toward the monthly budget only. */
export async function countGalleryOpen(organizationId: string, grantId: string): Promise<boolean> {
  const rows = await getDb().all<{ views: number }>(sql`
    INSERT INTO gallery_view_monthly (organization_id, grant_id, month, views) VALUES (${organizationId}, ${grantId}, ${monthKey()}, 1)
    ON CONFLICT (organization_id, grant_id, month) DO UPDATE SET views = views + 1
    RETURNING views
  `);
  return (rows[0]?.views ?? 0) <= GALLERY_MONTHLY_VIEW_BUDGET;
}

/** Retention for the limit tables (called from the daily cron). */
export async function pruneViewLimitTables(): Promise<void> {
  const db = getDb();
  await db.run(sql`DELETE FROM view_rate_window WHERE window_start < unixepoch() - 3600`);
  // Keep 13 months of the monthly rollup (margin reporting window).
  await db.run(
    sql`DELETE FROM gallery_view_monthly WHERE month < strftime('%Y-%m', unixepoch() - 390 * 86400, 'unixepoch')`,
  );
}
