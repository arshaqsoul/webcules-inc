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
import m29 from "../../migrations/0029_custom_domains.sql?raw";
import m30 from "../../migrations/0030_addon_pending.sql?raw";
import m31 from "../../migrations/0031_brand_assets.sql?raw";
import m32 from "../../migrations/0032_watermark.sql?raw";
import m33 from "../../migrations/0033_templates.sql?raw";
import m34 from "../../migrations/0034_forms.sql?raw";
import m35 from "../../migrations/0035_session_types.sql?raw";
import m36 from "../../migrations/0036_invoice_designer.sql?raw";
import m37 from "../../migrations/0037_email_overrides.sql?raw";
import m38 from "../../migrations/0038_booking_page.sql?raw";
import m39 from "../../migrations/0039_last_used.sql?raw";
import m40 from "../../migrations/0040_gallery_design.sql?raw";
import m41 from "../../migrations/0041_slideshow.sql?raw";
import m42 from "../../migrations/0042_video_duration.sql?raw";
import m43 from "../../migrations/0043_downloads.sql?raw";
import m44 from "../../migrations/0044_photo_shares.sql?raw";
import m45 from "../../migrations/0045_my_pwa.sql?raw";
import m46 from "../../migrations/0046_favorite_lists.sql?raw";
import m47 from "../../migrations/0047_asset_views.sql?raw";
import m48 from "../../migrations/0048_guests.sql?raw";
import m49 from "../../migrations/0049_system_state.sql?raw";
import m50 from "../../migrations/0050_booking_manage.sql?raw";
import m51 from "../../migrations/0051_setup_guide.sql?raw";
import m52 from "../../migrations/0052_booking_reminders.sql?raw";
import m53 from "../../migrations/0053_two_factor.sql?raw";
import m54 from "../../migrations/0054_notification_defaults.sql?raw";
import m55 from "../../migrations/0055_import_batch.sql?raw";
import m56 from "../../migrations/0056_business_identity.sql?raw";
import m57 from "../../migrations/0057_inbox.sql?raw";
import m58 from "../../migrations/0058_inbox_plumbing.sql?raw";
import m59 from "../../migrations/0059_lead_thread_absorb.sql?raw";
import m60 from "../../migrations/0060_streaming_downloads.sql?raw";
import m61 from "../../migrations/0061_gallery_order.sql?raw";
import m62 from "../../migrations/0062_welcome_image.sql?raw";
import m63 from "../../migrations/0063_welcome_banner.sql?raw";
import m64 from "../../migrations/0064_payment_stripe_account.sql?raw";
import m65 from "../../migrations/0065_studio_payment_currency.sql?raw";
import m66 from "../../migrations/0066_cull_edit.sql?raw";
// 0067 is reserved for the in-flight WEB-180 commerce-catalog migration —
// numbered ahead so both PRs land without a filename clash.
import m67 from "../../migrations/0067_commerce_catalog.sql?raw";
import m68 from "../../migrations/0068_gallery_design_undo.sql?raw";
// Carts (WEB-170) renumbered 0068 → 0069 after WEB-249 took 0068 on master.
import m69 from "../../migrations/0069_carts.sql?raw";
import m70 from "../../migrations/0070_checkout_sessions.sql?raw";
import m71 from "../../migrations/0071_integration_tokens.sql?raw";
// WEB-277 store designer landed as 0072 on master (0071 was held by the
// WEB-186 integration-tokens branch).
import m72 from "../../migrations/0072_store_designer.sql?raw";
// WEB-185 Lightroom publish ledger (landed as 0073 on master).
import m73 from "../../migrations/0073_integration_publish.sql?raw";
// WEB-196 download size ladder: the on-demand mid (~1280px) derivative
// (renumbered from 0073 during merge — master took 0073).
import m74 from "../../migrations/0074_mid_derivative.sql?raw";
// WEB-194 email-capture gate: who-took-files rows for guest galleries.
import m75 from "../../migrations/0075_email_capture.sql?raw";
// WEB-183 Drive import: explicit import sessions (Picker + drive.file relay).
import m76 from "../../migrations/0076_drive_import_sessions.sql?raw";
// WEB-305 portfolio core: curated public collections (site + collection +
// curation M2M) — the shared primitive for features A/B/C.
import m77 from "../../migrations/0077_portfolio_collections.sql?raw";
// WEB-344 portfolio AC3: rights attestation columns on portfolio_site.
import m78 from "../../migrations/0078_portfolio_rights_attestation.sql?raw";
// WEB-182 client-upload links: tokenized upload requests + quarantine rows.
import m79 from "../../migrations/0079_upload_requests.sql?raw";
import m80 from "../../migrations/0080_upload_session_request_ref.sql?raw";

const MIGRATIONS = [
  m01, m02, m03, m04, m05, m06, m07, m08, m09, m10, m11, m12, m13, m14, m15,
  m16, m17, m18, m19, m20, m21, m22, m23, m24, m25, m26, m27, m28, m29, m30, m31, m32, m33, m34, m35, m36, m37, m38, m39, m40, m41, m42, m43, m44, m45, m46, m47, m48, m49, m50, m51, m52, m53, m54, m55, m56, m57, m58, m59, m60, m61, m62,
m63,
m64,
m65,
m66,
m67,
m68,
m69,
m70,
m71,
m72,
m73, m74, m75, m76, m77, m78, m79, m80,
];

/** Every table, in an order that satisfies FK constraints when deleting. */
const TABLES = [
  "upload_request_asset", "upload_request",
  "portfolio_collection_asset", "portfolio_collection", "portfolio_site",
  "checkout_session",
  "integration_token",
  "cart_item", "cart", "price_list_gallery", "product_variant", "product", "price_list",
  "inbox_item", "thread_message", "thread",
  "two_factor", "import_batch",
  "gallery_selection", "gallery_favorite", "share_otp_log", "share_otp", "share_access_log", "download_email_capture",
  "share_grant_asset", "share_grant",
  "asset_tag", "upload_session", "integration_publish", "asset", "folder", "custom_domain",
  "form_response", "contract", "invoice", "payment", "org_counter",
  "lead_message", "lead",
  "booking", "booking_reminders", "project_status_event", "project", "client",
  "availability_rule", "blackout_date",
  "email_log", "portal_otp_log", "portal_otp",
  "gallery_view_monthly", "view_rate_window", "usage_counters", "rate_limit", "system_state",
  "audit_log", "template", "session_type", "studio_profile", "member", "invitation",
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
