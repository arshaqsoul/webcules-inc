/* Usage-counter maintenance (WEB-445) — the safety net behind the
 * trigger-maintained entitlement counters on usage_counters.
 *
 * The asset triggers (migrations/0083) keep month='total' (stored_bytes,
 * file_count, raw_bytes) and the 'YYYY-MM' upload rows (upload_bytes,
 * upload_ops) exact on every insert/delete — including bulk deletes and FK
 * cascades. The nightly cron calls resyncUsageCounters() to re-derive both
 * aggregates straight from the asset ledger anyway: if a trigger is ever
 * dropped, a migration half-applies, or someone hand-edits D1, the counters
 * self-heal within a day and usageCounterParity() is the check that proves
 * it (also exposed as scripts/usage-parity.mjs for staging/prod verification).
 *
 * The WEB-161 snapshot rollup (lib/margin.ts) owns different columns on the
 * monthly rows (stored_bytes/image_views/emails_sent); the re-derive only
 * writes the entitlement columns, so the two writers never collide. */
import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { USAGE_TOTAL_MONTH } from "@/lib/plans";

/** Re-derive the entitlement counters from the live asset SUM — nightly
 * safety net, and the one-time backfill for any environment that predates
 * 0083. Idempotent; returns the number of org rows written. */
export async function resyncUsageCounters(): Promise<number> {
  const db = getDb();
  const totals = await db.run(sql`
    INSERT INTO usage_counters (organization_id, month, stored_bytes, file_count, raw_bytes, updated_at)
    SELECT organization_id, 'total', COALESCE(SUM(bytes), 0), COUNT(*),
           COALESCE(SUM(CASE WHEN kind = 'raw' THEN bytes ELSE 0 END), 0), unixepoch()
    FROM asset WHERE true
    GROUP BY organization_id
    ON CONFLICT (organization_id, month) DO UPDATE SET
      stored_bytes = excluded.stored_bytes,
      file_count = excluded.file_count,
      raw_bytes = excluded.raw_bytes,
      updated_at = unixepoch()
  `);
  const monthly = await db.run(sql`
    INSERT INTO usage_counters (organization_id, month, upload_bytes, upload_ops, updated_at)
    SELECT organization_id, strftime('%Y-%m', created_at, 'unixepoch'),
           COALESCE(SUM(bytes), 0), COUNT(*), unixepoch()
    FROM asset WHERE true
    GROUP BY organization_id, strftime('%Y-%m', created_at, 'unixepoch')
    ON CONFLICT (organization_id, month) DO UPDATE SET
      upload_bytes = excluded.upload_bytes,
      upload_ops = excluded.upload_ops,
      updated_at = unixepoch()
  `);
  return (totals.meta.rows_written ?? 0) + (monthly.meta.rows_written ?? 0);
}

export type UsageCounterMismatch = {
  organizationId: string;
  field: "stored_bytes" | "file_count" | "raw_bytes" | "upload_bytes";
  counter: number;
  live: number;
};

/** Parity check: counter-derived entitlement usage vs a fresh SUM/COUNT over
 * the asset ledger, per org. Lifetime totals and every monthly upload row
 * are compared; returns [] when the counters are exact. */
export async function usageCounterParity(): Promise<UsageCounterMismatch[]> {
  const db = getDb();
  const [counters, liveTotals, liveMonths] = await Promise.all([
    db
      .select({
        organizationId: schema.usageCounters.organizationId,
        month: schema.usageCounters.month,
        storedBytes: schema.usageCounters.storedBytes,
        fileCount: schema.usageCounters.fileCount,
        rawBytes: schema.usageCounters.rawBytes,
        uploadBytes: schema.usageCounters.uploadBytes,
      })
      .from(schema.usageCounters),
    db
      .select({
        organizationId: schema.assets.organizationId,
        bytes: sql<number>`coalesce(sum(${schema.assets.bytes}), 0)`,
        files: sql<number>`count(*)`,
        rawBytes: sql<number>`coalesce(sum(case when ${schema.assets.kind} = 'raw' then ${schema.assets.bytes} else 0 end), 0)`,
      })
      .from(schema.assets)
      .groupBy(schema.assets.organizationId),
    db
      .select({
        organizationId: schema.assets.organizationId,
        month: sql<string>`strftime('%Y-%m', ${schema.assets.createdAt}, 'unixepoch')`,
        bytes: sql<number>`coalesce(sum(${schema.assets.bytes}), 0)`,
      })
      .from(schema.assets)
      .groupBy(schema.assets.organizationId, sql`strftime('%Y-%m', ${schema.assets.createdAt}, 'unixepoch')`),
  ]);

  const liveByOrg = new Map(liveTotals.map((r) => [r.organizationId, r]));
  const liveByMonth = new Set(liveMonths.map((r) => `${r.organizationId}|${r.month}`));
  const liveMonthBytes = new Map(liveMonths.map((r) => [`${r.organizationId}|${r.month}`, Number(r.bytes)]));
  const seen = new Set<string>();
  const mismatches: UsageCounterMismatch[] = [];

  for (const c of counters) {
    if (c.month === USAGE_TOTAL_MONTH) {
      const live = liveByOrg.get(c.organizationId);
      const expected = {
        stored_bytes: Number(live?.bytes ?? 0),
        file_count: Number(live?.files ?? 0),
        raw_bytes: Number(live?.rawBytes ?? 0),
      };
      seen.add(c.organizationId);
      for (const [field, counter, want] of [
        ["stored_bytes", c.storedBytes, expected.stored_bytes],
        ["file_count", c.fileCount, expected.file_count],
        ["raw_bytes", c.rawBytes, expected.raw_bytes],
      ] as const) {
        if (counter !== want) mismatches.push({ organizationId: c.organizationId, field, counter, live: want });
      }
    } else if (/^\d{4}-\d{2}$/.test(c.month)) {
      // Zero-valued monthly rows for months with no live assets are harmless
      // (cron snapshots) — only nonzero-vs-live divergence is drift.
      const key = `${c.organizationId}|${c.month}`;
      const live = liveByMonth.has(key) ? liveMonthBytes.get(key)! : 0;
      if (c.uploadBytes !== live)
        mismatches.push({ organizationId: c.organizationId, field: "upload_bytes", counter: c.uploadBytes, live });
    }
  }

  // An org with assets but no 'total' counter row is the loudest drift of
  // all (entitlements would read zero usage) — flag every field.
  for (const [organizationId, live] of liveByOrg) {
    if (seen.has(organizationId)) continue;
    mismatches.push(
      { organizationId, field: "stored_bytes", counter: 0, live: Number(live.bytes) },
      { organizationId, field: "file_count", counter: 0, live: Number(live.files) },
      { organizationId, field: "raw_bytes", counter: 0, live: Number(live.rawBytes) },
    );
  }
  return mismatches;
}
