#!/usr/bin/env node
/* usage-parity.mjs (WEB-445) — compare the usage_counters entitlement
 * aggregates against the live asset SUM, directly against a remote D1.
 *
 *   node scripts/usage-parity.mjs staging
 *   node scripts/usage-parity.mjs production
 *
 * This is the documented parity check for the WEB-445 acceptance criteria:
 * after the migration + backfill land on an environment, it must print
 * "parity OK" (exit 0). Any diverging org row is printed with both values
 * and the exit code is 1.
 *
 * Uses the global `cf` CLI (authenticated as webculesco@gmail.com) per the
 * standing AGENTS.md rule; `npx wrangler d1 execute` is the fallback. */
import { execFileSync } from "node:child_process";

const TARGETS = {
  staging: { db: "webcules-snap-staging", id: "9b850d02-67d3-4c1b-a7ed-482cc587b2d5" },
  production: { db: "webcules-snap", id: "badece16-2231-4b37-81ac-54f7c4bbf464" },
};

const target = TARGETS[process.argv[2]];
if (!target) {
  console.error("usage: node scripts/usage-parity.mjs staging|production");
  process.exit(2);
}

// Lifetime totals + monthly upload rows vs the ledger, in one round trip
// each. Single-line SQL only (Git Bash mangles multiline through cf).
const TOTALS_SQL =
  "SELECT c.organization_id AS org, c.stored_bytes AS counter_bytes, COALESCE(l.bytes,0) AS live_bytes, c.file_count AS counter_files, COALESCE(l.files,0) AS live_files, c.raw_bytes AS counter_raw, COALESCE(l.raw_bytes,0) AS live_raw FROM usage_counters c LEFT JOIN (SELECT organization_id, SUM(bytes) AS bytes, COUNT(*) AS files, SUM(CASE WHEN kind='raw' THEN bytes ELSE 0 END) AS raw_bytes FROM asset GROUP BY organization_id) l ON l.organization_id = c.organization_id WHERE c.month = 'total' AND (c.stored_bytes != COALESCE(l.bytes,0) OR c.file_count != COALESCE(l.files,0) OR c.raw_bytes != COALESCE(l.raw_bytes,0))";
const MONTHS_SQL =
  "SELECT c.organization_id AS org, c.month, c.upload_bytes AS counter_bytes, COALESCE(l.bytes,0) AS live_bytes FROM usage_counters c LEFT JOIN (SELECT organization_id, strftime('%Y-%m', created_at, 'unixepoch') AS month, SUM(bytes) AS bytes FROM asset GROUP BY 1,2) l ON l.organization_id = c.organization_id AND l.month = c.month WHERE c.month != 'total' AND c.upload_bytes != COALESCE(l.bytes,0)";
const MISSING_SQL =
  "SELECT a.organization_id AS org, SUM(a.bytes) AS live_bytes, COUNT(*) AS live_files FROM asset a LEFT JOIN usage_counters c ON c.organization_id = a.organization_id AND c.month = 'total' WHERE c.organization_id IS NULL GROUP BY a.organization_id";

function query(sqlText) {
  try {
    const out = execFileSync("cf", ["d1", "query", target.id, "--sql", sqlText], { encoding: "utf8" });
    return JSON.parse(out);
  } catch (err) {
    // cf missing or not authenticated — fall back to wrangler (flagged per AGENTS.md).
    console.error("[note] cf CLI unavailable, falling back to wrangler:", String(err.message).split("\n")[0]);
    const out = execFileSync(
      "npx",
      ["wrangler", "d1", "execute", target.db, "--remote", "--json", "--command", sqlText],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return JSON.parse(out);
  }
}

let bad = 0;
for (const [label, sqlText] of [
  ["lifetime totals", TOTALS_SQL],
  ["monthly upload rows", MONTHS_SQL],
  ["orgs missing a total row", MISSING_SQL],
]) {
  const rows = query(sqlText);
  for (const r of rows) {
    bad++;
    console.log(`MISMATCH [${label}] org=${r.org} ${JSON.stringify(r)}`);
  }
}

if (bad === 0) {
  console.log(`parity OK — usage_counters match the live asset SUM on ${process.argv[2]}`);
  process.exit(0);
}
console.error(`${bad} diverging row(s) on ${process.argv[2]}`);
process.exit(1);
