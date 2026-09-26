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
