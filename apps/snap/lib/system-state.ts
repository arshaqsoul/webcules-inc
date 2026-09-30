/* System-wide throttle gates (WEB-284) — the Sept billing incident entered
 * through unthrottled repeated invocations of privileged endpoints. Gates are
 * claim-based upserts: the caller that flips the timestamp owns the window. */
import { sql } from "drizzle-orm";

import { getDb } from "./db";

/** Try to claim `key` for the next `minIntervalSec` seconds. Returns true when
 * claimed (caller proceeds) or false when a claim is still holding (caller
 * rejects with 429). Atomic: the conditional upsert makes concurrent first
 * callers race inside D1 instead of in worker isolates. */
export async function claimThrottleGate(key: string, minIntervalSec: number): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const res = await getDb().run(
    sql`INSERT INTO system_state (key, value) VALUES (${key}, ${String(now)})
        ON CONFLICT (key) DO UPDATE SET value = ${String(now)}
        WHERE CAST(system_state.value AS INTEGER) + ${minIntervalSec} <= ${String(now)}`,
  );
  return (res.meta?.rows_written ?? 1) > 0;
}
