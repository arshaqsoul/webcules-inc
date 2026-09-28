/* Test-harness DB helpers: apply the real migrations (?raw imports — workerd
 * has no node:fs) to the per-file isolated D1, truncate between tests, and
 * seed the minimum rows repos need (org/user/profile/project). */
import { env } from "cloudflare:test";

import m01 from "../../migrations/0001_init.sql?raw";
import m02 from "../../migrations/0002_auth_org_ratelimit.sql?raw";
import m03 from "../../migrations/0003_studio_logo.sql?raw";
import m04 from "../../migrations/0004_booking_uniqueness.sql?raw";
import m05 from "../../migrations/0005_share_token_enc.sql?raw";
import m06 from "../../migrations/0006_gallery_otp.sql?raw";
import m07 from "../../migrations/0007_stripe_connect.sql?raw";
import m08 from "../../migrations/0008_asset_tags.sql?raw";
import m09 from "../../migrations/0009_plan_fields.sql?raw";
import m10 from "../../migrations/0010_raw_vault.sql?raw";
import m11 from "../../migrations/0011_dormancy.sql?raw";
import m12 from "../../migrations/0012_view_limits.sql?raw";
import m13 from "../../migrations/0013_usage_counters.sql?raw";
import m14 from "../../migrations/0014_client_notify.sql?raw";
import m15 from "../../migrations/0015_portal_auth.sql?raw";
import m16 from "../../migrations/0016_payment_tracking.sql?raw";
import m17 from "../../migrations/0017_invoices.sql?raw";
import m18 from "../../migrations/0018_contracts.sql?raw";
import m19 from "../../migrations/0019_upload_sessions.sql?raw";
import m20 from "../../migrations/0020_rejected_at.sql?raw";
import m21 from "../../migrations/0021_invoice_payment.sql?raw";
import m22 from "../../migrations/0022_asset_fingerprint.sql?raw";
import m23 from "../../migrations/0023_asset_ratings.sql?raw";
import m24 from "../../migrations/0024_selections.sql?raw";
import m25 from "../../migrations/0025_pending_plan.sql?raw";
import m26 from "../../migrations/0026_plan_changed_at.sql?raw";
import m27 from "../../migrations/0027_project_folders.sql?raw";
import m28 from "../../migrations/0028_multi_studio.sql?raw";

const MIGRATIONS = [
  m01, m02, m03, m04, m05, m06, m07, m08, m09, m10, m11, m12, m13, m14, m15,
  m16, m17, m18, m19, m20, m21, m22, m23, m24, m25, m26, m27, m28,
];

/** Every table, in an order that satisfies FK constraints when deleting. */
const TABLES = [
  "gallery_selection", "gallery_favorite", "share_otp_log", "share_otp", "share_access_log",
  "share_grant_asset", "share_grant",
  "asset_tag", "upload_session", "asset", "folder",
  "contract", "invoice", "payment", "org_counter",
  "lead_message", "lead",
  "booking", "project_status_event", "project", "client",
  "availability_rule", "blackout_date",
  "email_log", "portal_otp_log", "portal_otp",
  "gallery_view_monthly", "view_rate_window", "usage_counters", "rate_limit",
  "audit_log", "studio_profile", "member", "invitation",
  "session", "account", "verification", "user", "organization",
];

/** Split SQL into statements (quote-aware; no triggers/BEGIN blocks in these
 * migrations, so a top-level `;` split is exact) and strip `--` comments —
 * D1's exec() is line-oriented, so multi-line DDL must go through batch(). */
function sqlStatements(sql: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const line of sql.split("\n")) {
    const trimmed = line.trim();
    if (!quote && (trimmed.startsWith("--") || trimmed === "")) continue;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === "'" || ch === '"') {
        quote = ch;
      }
    }
    current += (current ? "\n" : "") + line;
    if (!quote && trimmed.endsWith(";")) {
      out.push(current);
      current = "";
    }
  }
  if (current.trim()) out.push(current);
  return out;
}

export async function applyMigrations(): Promise<void> {
  for (const sql of MIGRATIONS) {
    const statements = sqlStatements(sql);
    if (statements.length) await env.D1.batch(statements.map((s) => env.D1.prepare(s)));
  }
}

/** Wipe all rows (order respects FKs); R2 objects are per-file isolated anyway. */
export async function resetDb(): Promise<void> {
  for (const table of TABLES) {
    await env.D1.exec(`DELETE FROM ${table};`);
  }
}
