/* Drizzle schema for Snap — dedicated D1 database `webcules-snap`.
 * Source of truth: Linear project doc "Snap · Domain Model & Data Design".
 * Matching DDL: migrations/0001_init.sql (keep both in sync by hand).
 *
 * Multi-tenancy rules:
 *  - every tenant table carries organization_id, composite indexes lead with it
 *  - better-auth core tables keep singular names ("user", "session", …)
 *    required by the drizzle adapter; organization/member/invitation come
 *    from the organization plugin
 *  - raw share-link tokens are NEVER stored — only tokenHash (SHA-256)
 */
import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const ts = (name: string) => integer(name, { mode: "timestamp" }).notNull().default(sql`(unixepoch())`);

/* ---------------- Better Auth core ---------------- */

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  /** WEB-279 twoFactor plugin: flips true only after a live TOTP verify. */
  twoFactorEnabled: integer("two_factor_enabled", { mode: "boolean" }).notNull().default(false),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

/* WEB-279: Better Auth twoFactor plugin — one row per enabled account;
 * secret + backup codes are stored encrypted by the plugin (AUTH_SECRET). */
export const twoFactor = sqliteTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    verified: integer("verified", { mode: "boolean" }).notNull().default(true),
    failedVerificationCount: integer("failed_verification_count").notNull().default(0),
    lockedUntil: integer("locked_until", { mode: "timestamp" }),
  },
  (t) => [index("two_factor_user_id_idx").on(t.userId)],
);

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  /** Organization plugin: the staff member's active organization. */
  activeOrganizationId: text("active_organization_id"),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

/* Better Auth rate limiting (storage: "database" — Workers are multi-isolate).
 * lastRequest is written by better-auth as a raw epoch-ms NUMBER (not a Date),
 * so the column is a plain integer — no timestamp mode mapping. */
export const rateLimit = sqliteTable(
  "rate_limit",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    count: integer("count").notNull().default(0),
    lastRequest: integer("last_request").notNull(),
  },
  (t) => [uniqueIndex("rate_limit_key_unique").on(t.key)],
);

/* ---------------- Better Auth organization plugin ---------------- */

export const organization = sqliteTable(
  "organization",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    logo: text("logo"),
    metadata: text("metadata"),
    /** WEB-217 multi-studio: family link — the parent org owns the
     * subscription; children are full orgs whose quotas pool into it.
     * Exactly one level deep (a parent never has a parent). FK lives in the
     * migration DDL (ON DELETE SET NULL), same as parent_grant_id. */
    parentOrganizationId: text("parent_organization_id"),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [uniqueIndex("organization_slug_unique").on(t.slug), index("organization_parent_idx").on(t.parentOrganizationId)],
);

export const member = sqliteTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: ts("created_at"),
  },
  (t) => [
    uniqueIndex("member_org_user_unique").on(t.organizationId, t.userId),
    index("member_user_idx").on(t.userId),
  ],
);

export const invitation = sqliteTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("member"),
    status: text("status").notNull().default("pending"),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    inviterId: text("inviter_id"),
    createdAt: ts("created_at"),
  },
  (t) => [index("invitation_org_email_idx").on(t.organizationId, t.email)],
);

/* ---------------- Studio profiles (tenant branding + settings) ---------------- */

export const studioProfiles = sqliteTable("studio_profile", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  studioName: text("studio_name").notNull(),
  contactEmail: text("contact_email"),
  timezone: text("timezone").notNull().default("UTC"),
  logoAssetId: text("logo_asset_id"),
  /** R2 key of the studio logo ({orgId}/branding/logo.ext). */
  logoKey: text("logo_key"),
  /** JSON: { accent: "#rrggbb", fontFamily?: string } */
  brand: text("brand").notNull().default("{}"),
  /** WEB-239: JSON bag of generated brand-asset R2 keys + revision stamp —
   * { rev, favicon, appleTouch, emailHeader, ogCard, watermark }. */
  brandAssets: text("brand_assets"),
  /** JSON: booking rules snapshot (slot length default, buffers, lead time) */
  bookingSettings: text("booking_settings").notNull().default("{}"),
  /** Public, rotatable embed key — resolves widgets to this studio. */
  embedKey: text("embed_key").unique(),
  /** JSON array of allowed embed origins (CSP frame-ancestors + Origin check). */
  embedOrigins: text("embed_origins").notNull().default("[]"),
  /** JSON: { enabled: bool, retainDays?: number } — rejected auto-delete policy */
  rejectedPolicy: text("rejected_policy").notNull().default('{"enabled":false}'),
  exifStripDerived: integer("exif_strip_derived", { mode: "boolean" }).notNull().default(false),
  /** WEB-278: JSON map of studio-alert toggles (absent key = alert on).
   * Client transactional emails are never governed by these. */
  notificationPrefs: text("notification_prefs"),
  /** WEB-278: default notify state applied to freshly created client rows. */
  clientNotifyDefault: integer("client_notify_default", { mode: "boolean" }).notNull().default(true),
  /** WEB-278: pre-fill for new share grants — 7/30/60/90/365 days, 0 = no
   * expiry; null = never configured (UI treats 90 as the effective default). */
  defaultExpiryDays: integer("default_expiry_days"),
  /** WEB-278: pre-fill for the new-grant download toggle. */
  defaultAllowDownload: integer("default_allow_download", { mode: "boolean" }).notNull().default(true),
  /** WEB-307: dual delivery — inbound client replies mirror to the contact
   * inbox while the Snap inbox is young (default on). */
  inboxMirror: integer("inbox_mirror", { mode: "boolean" }).notNull().default(true),
  /** WEB-275: "members see RAW vault" per-org toggle (admins always can). */
  memberRawAccess: integer("member_raw_access", { mode: "boolean" }).notNull().default(false),
  /** WEB-277: business identity JSON — legalName, addressLines, taxId, phone,
   * website (see lib/business.ts; null = never set → PDFs unchanged). */
  business: text("business"),
  /** Stripe Connect Express account (KYC/bank data lives in Stripe, never here). */
  stripeAccountId: text("stripe_account_id"),
  /** not_connected | pending | active | restricted — derived from Stripe, cached. */
  stripeConnectState: text("stripe_connect_state").notNull().default("not_connected"),
  /** Snap plan: free | lite | studio | pro (definitions in lib/plans.ts). */
  plan: text("plan").notNull().default("studio"),
  /** active | past_due | grace | canceled — subscription health. */
  planStatus: text("plan_status").notNull().default("active"),
  /** Snap's own billing (platform account) — customer + subscription ids. */
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  /** Current subscription period end (epoch seconds). */
  planPeriodEnd: integer("plan_period_end"),
  /** Scheduled downgrade target (0025): cheaper-tier switch that starts at
   * the next billing cycle — entitlements stay on `plan` until then. */
  pendingPlan: text("pending_plan"),
  /** When the plan last changed, epoch seconds (0026) — marks tiers adopted
   * mid-cycle (eligible for an instant prorated switch-back). */
  planChangedAt: integer("plan_changed_at"),
  /* Dormancy & retention (WEB-159) — epoch seconds; the sweep in
   * lib/dormancy.ts owns every transition. last_active_at is touched by
   * getOrgContext at most hourly and resets the whole lifecycle. */
  lastActiveAt: integer("last_active_at"),
  dormantNotice1At: integer("dormant_notice1_at"),
  dormantNotice2At: integer("dormant_notice2_at"),
  /** Bulk IA move completed at (null = objects still standard). */
  dormantIaAt: integer("dormant_ia_at"),
  /** Set when a returning user requests bulk restore; cron batches it. */
  iaRestoreRequestedAt: integer("ia_restore_requested_at"),
  /** Scheduled permanent deletion (set when the final notice goes out). */
  dormantPurgeDeadline: integer("dormant_purge_deadline"),
  /** null | 'purging' | 'purged'. */
  dormantPurgeState: text("dormant_purge_state"),
  /** Objects remaining in the active bulk class batch (IA move or restore). */
  bulkClassOpsRemaining: integer("bulk_class_ops_remaining"),
  /** Last key processed by the active bulk batch (R2 listing startAfter). */
  bulkClassCursor: text("bulk_class_cursor"),
  /** WEB-224: Studio-tier custom-domain add-on ($5/mo) — flipped by the
   * Stripe webhook on subscription-item add/remove; entitlements only read. */
  addonCustomDomain: integer("addon_custom_domain", { mode: "boolean" }).notNull().default(false),
  /** WEB-231: the studio cancelled the add-on — entitlement holds until
   * plan_period_end, then the item is deleted and this clears. */
  pendingAddonRemoval: integer("pending_addon_removal", { mode: "boolean" }).notNull().default(false),
  /** WEB-252: invoice designer settings JSON (numbering/tax/terms). */
  invoiceSettings: text("invoice_settings"),
  /** WEB-253: per-template email copy overrides JSON. */
  emailOverrides: text("email_overrides"),
  /** WEB-254: booking page designer JSON (hero/intro/FAQ/socials/thanks). */
  bookingPage: text("booking_page"),
  /** WEB-269/270: setup guide — dismissed hides the card + first-login panel
   * forever (reopenable); reopened records the undo for ops telemetry.
   * Nullable by design (null = not dismissed — reopenedSetup clears it). */
  setupDismissedAt: integer("setup_dismissed_at", { mode: "timestamp" }),
  setupReopenedAt: integer("setup_reopened_at", { mode: "timestamp" }),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

/* ---------------- Custom domains (WEB-224) ---------------- */

/** Per-org hostnames serving the client surface (galleries, booking, portal)
 * via Cloudflare for SaaS custom hostnames. Soft-delete only — rows are never
 * hard-deleted (WEB-152 no-data-loss); the partial unique index frees the
 * hostname claim the moment removed_at is set. */
export const customDomains = sqliteTable(
  "custom_domain",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Normalized: lowercase, no scheme/path/trailing dot; subdomains only. */
    hostname: text("hostname").notNull(),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    /** pending_verification | verified | cert_pending | active | degraded | failed | suspended_entitlement | removed */
    status: text("status").notNull().default("pending_verification"),
    /** "snap-verify=<32 hex>" — the TXT value the studio publishes at
     * _snap-verify.<hostname>. */
    verificationToken: text("verification_token").notNull(),
    /** created_at + 30d, epoch seconds; the sweep expires stale pendings. */
    verificationExpiresAt: integer("verification_expires_at"),
    /** Cloudflare Custom Hostnames API id. */
    cfCustomHostnameId: text("cf_custom_hostname_id"),
    /** CF ssl.status string, mirrored for the UI. */
    certStatus: text("cert_status"),
    /** CF's DCV TXT record (name + value) — rendered alongside our own
     * _snap-verify TXT so the studio can publish every required record. */
    dcvTxtName: text("dcv_txt_name"),
    dcvTxtValue: text("dcv_txt_value"),
    /** Human-readable last failure (DNS mismatch, CAA blocked, …). */
    lastError: text("last_error"),
    lastCheckedAt: integer("last_checked_at"),
    /** Degraded-email throttle stamp (sweep; ≤1 per domain per 7d). */
    lastNotifiedAt: integer("last_notified_at"),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
    removedAt: integer("removed_at"),
  },
  (t) => [
    uniqueIndex("custom_domain_hostname_unique").on(t.hostname).where(sql`${t.removedAt} IS NULL`),
    index("custom_domain_org_idx").on(t.organizationId, t.status),
  ],
);

/* ---------------- Clients (per-studio records; same email, many studios) ---------------- */

export const clients = sqliteTable(
  "client",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    phone: text("phone"),
    /** Portal user this client record belongs to (linked on first login). */
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    notes: text("notes"),
    /** Client-notification opt-out for THIS studio (WEB-136; per-row = per-studio). */
    notify: integer("notify", { mode: "boolean" }).notNull().default(true),
    /** WEB-276: the CSV import batch that created this row (undo bookkeeping). */
    importBatchId: text("import_batch_id"),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [
    uniqueIndex("client_org_email_unique").on(t.organizationId, t.email),
    index("client_user_idx").on(t.userId),
  ],
);

/* ---------------- CSV import batches (WEB-276) ---------------- */

/** One row per committed clients/leads import — powers reports and the
 * 7-day undo (rows carry import_batch_id; undo removes only untouched ones). */
export const importBatch = sqliteTable(
  "import_batch",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** clients | leads */
    kind: text("kind").notNull(),
    createdCount: integer("created_count").notNull(),
    skippedCount: integer("skipped_count").notNull(),
    updatedCount: integer("updated_count").notNull().default(0),
    createdBy: text("created_by"),
    createdAt: ts("created_at"),
  },
  (t) => [index("import_batch_org_idx").on(t.organizationId, t.createdAt)],
);

/* ---------------- Leads (embed contact form) ---------------- */

export const leads = sqliteTable(
  "lead",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    eventDate: integer("event_date", { mode: "timestamp" }),
    eventType: text("event_type"),
    message: text("message"),
    /** contact_form | booking | manual */
    source: text("source").notNull().default("contact_form"),
    /** new | replied | converted | archived */
    status: text("status").notNull().default("new"),
    embedOrigin: text("embed_origin"),
    /** WEB-248: custom form answers — JSON { fieldId: {label, value} }. */
    customFields: text("custom_fields"),
    /** WEB-250: soft link to the session type the inquiry is about. */
    sessionTypeId: text("session_type_id"),
    /** WEB-276: the CSV import batch that created this row (undo bookkeeping). */
    importBatchId: text("import_batch_id"),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [index("lead_org_status_idx").on(t.organizationId, t.status, t.createdAt)],
);

export const leadMessages = sqliteTable(
  "lead_message",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    /** in | out */
    direction: text("direction").notNull(),
    fromUserId: text("from_user_id").references(() => user.id, { onDelete: "set null" }),
    subject: text("subject"),
    body: text("body").notNull(),
    providerId: text("provider_id"),
    createdAt: ts("created_at"),
  },
  (t) => [index("lead_message_lead_idx").on(t.organizationId, t.leadId, t.createdAt)],
);

/* ---------------- Projects (pipeline) ---------------- */

export const projects = sqliteTable(
  "project",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
    leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
    bookingId: text("booking_id"),
    title: text("title").notNull(),
    /** booked | snapping | evaluation | complete | closed */
    status: text("status").notNull().default("booked"),
    eventDate: integer("event_date", { mode: "timestamp" }),
    notes: text("notes"),
    /** WEB-135: quoted package total — anchors paid/partial/unpaid badges. */
    quotedTotalMinor: integer("quoted_total_minor"),
    quotedCurrency: text("quoted_currency").notNull().default("usd"),
    /** WEB-242: per-project watermark override — null/'inherit' | 'on' | 'off'. */
    watermarkOverride: text("watermark_override"),
    /** WEB-258: gallery design JSON (cover/layout/theme), <= 16 KB, app-validated.
     * NULL = classic gallery (or the org's default gallery_preset template). */
    galleryDesign: text("gallery_design"),
    /** WEB-259: slideshow config JSON (enabled/pace/transition/music + start
     * offset), <= 2 KB. Kept out of gallery_design so the basic slideshow
     * stays free while the design layer is Lite+. NULL = no button. */
    gallerySlideshow: text("gallery_slideshow"),
    /** WEB-269: 1 = the setup guide's demo gallery (excluded from platform
     * margin rollups; counts toward the studio's storage quota). */
    demo: integer("demo"),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [index("project_org_status_idx").on(t.organizationId, t.status, t.createdAt)],
);

export const projectStatusEvents = sqliteTable(
  "project_status_event",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: ts("created_at"),
  },
  (t) => [index("pse_project_idx").on(t.organizationId, t.projectId, t.createdAt)],
);

/* ---------------- Availability & bookings ---------------- */

export const availabilityRules = sqliteTable(
  "availability_rule",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** 0–6 (Sunday–Saturday) */
    weekday: integer("weekday").notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
    slotMinutes: integer("slot_minutes").notNull().default(60),
    bufferMinutes: integer("buffer_minutes").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    /** WEB-250: scoped to one session type (null = applies to all). */
    sessionTypeId: text("session_type_id"),
    createdAt: ts("created_at"),
  },
  (t) => [index("availability_org_idx").on(t.organizationId, t.weekday)],
);

export const blackoutDates = sqliteTable(
  "blackout_date",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** YYYY-MM-DD in studio timezone */
    date: text("date").notNull(),
    reason: text("reason"),
    createdAt: ts("created_at"),
  },
  (t) => [uniqueIndex("blackout_org_date_unique").on(t.organizationId, t.date)],
);

export const bookings = sqliteTable(
  "booking",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    startAt: integer("start_at", { mode: "timestamp" }).notNull(),
    endAt: integer("end_at", { mode: "timestamp" }).notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    clientEmail: text("client_email").notNull(),
    clientName: text("client_name"),
    /** pending | confirmed | canceled */
    status: text("status").notNull().default("pending"),
    /** unpaid | deposit_paid | paid */
    paymentStatus: text("payment_status").notNull().default("unpaid"),
    notes: text("notes"),
    /** WEB-250: booked session type (kept on booking delete of the type). */
    sessionTypeId: text("session_type_id"),
    /** WEB-250: booking-question answers (JSON, validated at submit). */
    answers: text("answers"),
    /** WEB-272: manage-link token — SHA-256 hash is the lookup key; the raw
     * 256-bit token only ever lives in the client's email link. */
    manageTokenHash: text("manage_token_hash"),
    /** WEB-272: AES-GCM(token) under the share-token key — re-email only. */
    manageTokenEnc: text("manage_token_enc"),
    /** active | revoked — revoked kills the /booking/{token} page + APIs. */
    manageTokenStatus: text("manage_token_status").notNull().default("active"),
    /** Nullable by design (null = not revoked) — plain INTEGER in 0050. */
    manageRevokedAt: integer("manage_revoked_at", { mode: "timestamp" }),
    /** WEB-272: set on each reschedule; the row updates in place (same id). */
    rescheduledAt: ts("rescheduled_at"),
    previousStartAt: integer("previous_start_at", { mode: "timestamp" }),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [
    index("booking_org_start_idx").on(t.organizationId, t.startAt),
    uniqueIndex("booking_manage_token_hash_unique")
      .on(t.manageTokenHash)
      .where(sql`manage_token_hash IS NOT NULL`),
  ],
);

/* WEB-273: booking-reminder exact-once guard — one row per
 * (booking, offset). The INSERT..ON CONFLICT DO NOTHING claim decides the
 * sole sender; a repeated sweep can never double-send. */
export const bookingReminders = sqliteTable(
  "booking_reminders",
  {
    bookingId: text("booking_id").notNull(),
    organizationId: text("organization_id").notNull(),
    offsetHours: integer("offset_hours").notNull(),
    sentAt: ts("sent_at"),
  },
  (t) => [
    primaryKey({ columns: [t.bookingId, t.offsetHours] }),
    index("booking_reminders_org_idx").on(t.organizationId, t.sentAt),
  ],
);

/* ---------------- Assets (R2-backed media) ---------------- */

export const assets = sqliteTable(
  "asset",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** {orgId}/{projectId}/{assetId}/{filename} — org prefix is validated on every op */
    storageKey: text("storage_key").notNull().unique(),
    /** image | video | raw | other */
    kind: text("kind").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    bytes: integer("bytes").notNull().default(0),
    width: integer("width"),
    height: integer("height"),
    /** WEB-260: video duration ms (browser decoder at upload). */
    durationMs: integer("duration_ms"),
    /** EXIF capture time, epoch seconds (set at upload confirm / backfill);
     * -1 = scanned, none found; null = not scanned yet. Drives "date taken". */
    capturedAt: integer("captured_at"),
    /** Rainbow-sort key from the browser's thumbnail analysis (lib/color-sort.ts). */
    colorKey: integer("color_key"),
    /** WEB-263: sneak peek — surfaces on the client home before the gallery
     * opens (Studio gate). */
    sneakPeek: integer("is_sneak_peek", { mode: "boolean" }).notNull().default(false),
    checksum: text("checksum"),
    /** fp1:sha256(size + first 1MB) — duplicate-upload detection. */
    fingerprint: text("fingerprint"),
    /** Culling ratings (0023): stars 0-5 (0 = unrated); color 0 none, 1 red, 2 yellow, 3 green, 4 blue, 5 purple. */
    stars: integer("stars").notNull().default(0),
    color: integer("color").notNull().default(0),
    /** uploaded | approved | rejected | shared */
    status: text("status").notNull().default("uploaded"),
    /** WEB-118: when the asset was (last) rejected — epoch seconds; anchors
     * the rejected auto-delete retention clock, cleared on approve/reset. */
    rejectedAt: integer("rejected_at"),
    thumbKey: text("thumb_key"),
    previewKey: text("preview_key"),
    /** WEB-242: watermarked preview derivative (browser-composited). */
    previewWmKey: text("preview_wm_key"),
    exifStripped: integer("exif_stripped", { mode: "boolean" }).notNull().default(false),
    uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: ts("created_at"),
    /* RAW Vault (WEB-153) — epoch seconds, null = stage not reached. */
    rawArchivedAt: integer("raw_archived_at"),
    rawKeepUntil: integer("raw_keep_until"),
    rawNoticeAt: integer("raw_notice_at"),
    rawPurgeWarn1At: integer("raw_purge_warn1_at"),
    rawPurgeWarn2At: integer("raw_purge_warn2_at"),
    /** WEB-216: the one folder this asset lives in (null = unfiled). Moving
     * rewrites this pointer only — storage keys and R2 bytes never move. */
    folderId: text("folder_id").references(() => folders.id, { onDelete: "set null" }),
  },
  (t) => [
    index("asset_org_project_idx").on(t.organizationId, t.projectId, t.createdAt),
    index("asset_raw_scan_idx").on(t.kind, t.createdAt),
    index("asset_raw_archive_idx").on(t.rawArchivedAt),
    index("asset_fp_idx").on(t.projectId, t.fingerprint),
  ],
);

/* ---------------- Project folders (WEB-216) ----------------
 * Structural one-home grouping for delivery — deliberately NOT tags: a tag
 * is many-to-many curation vocabulary; an asset lives in one folder (or
 * none). Flat per project in v1 (no parent nesting). */

export const folders = sqliteTable(
  "folder",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sort: integer("sort").notNull().default(0),
    createdAt: ts("created_at"),
  },
  (t) => [index("folder_org_project_idx").on(t.organizationId, t.projectId, t.sort)],
);

/* ---------------- Curation tags (Epic 8) ---------------- */

export const assetTags = sqliteTable(
  "asset_tag",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
    createdAt: ts("created_at"),
  },
  (t) => [
    // PK(asset_id, tag) enforced in SQL (0008); org index for tag listings.
    index("asset_tag_org_tag_idx").on(t.organizationId, t.tag),
  ],
);

/* ---------------- Share grants (secure client galleries) ---------------- */

export const shareGrants = sqliteTable(
  "share_grant",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    clientEmail: text("client_email").notNull(),
    /** SHA-256 of the 256-bit URL token — the lookup key; raw token never stored. */
    tokenHash: text("token_hash").notNull().unique(),
    /** AES-GCM(token) under a BETTER_AUTH_SECRET-derived key — re-email only. */
    tokenEnc: text("token_enc"),
    /** active | revoked | regenerated (null expiry = never expires) */
    status: text("status").notNull().default("active"),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    parentGrantId: text("parent_grant_id"),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    revokedAt: integer("revoked_at", { mode: "timestamp" }),
    /** Studio-controlled: may the client download originals from this link. */
    allowDownload: integer("allow_download", { mode: "boolean" }).notNull().default(true),
    /** WEB-242: proofing mode — downloads deliver the watermarked preview. */
    proofing: integer("proofing", { mode: "boolean" }).notNull().default(false),
    /** How the gallery's photos are currently ordered (lib/gallery-order.ts OrderMode). */
    orderMode: text("order_mode").notNull().default("upload_old"),
    /** Optional welcome collage (welcome_image.id) shown in the email + gallery header. */
    welcomeImageId: text("welcome_image_id"),
    /** Show the welcome image as the first thing on the client gallery
     * (the email always heads with it; the banner is opt-in). */
    welcomeBanner: integer("welcome_banner", { mode: "boolean" }).notNull().default(false),
    /** Client interaction mode (0024): off | favorites | selection. */
    selectionMode: text("selection_mode").notNull().default("favorites"),
    /** Max picks for selection mode; null = unlimited. */
    selectionLimit: integer("selection_limit"),
    /** Selection deadline, epoch seconds; null = none. */
    selectionDeadline: integer("selection_deadline"),
    /** WEB-261: downloads 2.0 controls (PIN hash, count limit, approval
     * toggle, web-size option) as validated JSON. NULL = plain downloads. */
    downloadSettings: text("download_settings"),
    /** WEB-262: per-photo social sharing allowed (default on). */
    allowSharing: integer("allow_sharing", { mode: "boolean" }).notNull().default(true),
    /** WEB-266: scheduled opening — before this moment the gallery renders
     * the pre-registration page (null = open now, today's behavior). */
    openAt: integer("open_at", { mode: "timestamp" }),
    /** WEB-266: last "new photos added" notification stamp. */
    updatedNotifyAt: integer("updated_notify_at", { mode: "timestamp" }),
    /** WEB-261: expiry-reminder email sent (epoch seconds, once per grant). */
    expiryRemindedAt: integer("expiry_reminded_at"),
    createdAt: ts("created_at"),
  },
  (t) => [index("share_grant_org_project_idx").on(t.organizationId, t.projectId, t.status)],
);

/** WEB-261: download approval requests. Download-all streams on demand
 * (lib/zip-delivery.ts); a row exists only for galleries that require studio
 * sign-off. State machine in lib/gallery-downloads.ts. `zip_key` is a
 * pre-3.0 leftover pending purge (repos/downloads.ts purgeLegacyZips). */
export const downloadRequests = sqliteTable(
  "download_request",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    grantId: text("grant_id")
      .notNull()
      .references(() => shareGrants.id, { onDelete: "cascade" }),
    clientEmail: text("client_email").notNull(),
    scope: text("scope").notNull().default("all"),
    folderName: text("folder_name"),
    assetIds: text("asset_ids"),
    sizePref: text("size_pref").notNull().default("full"),
    state: text("state").notNull().default("requested"),
    note: text("note"),
    zipKey: text("zip_key"),
    zipBytes: integer("zip_bytes"),
    fileCount: integer("file_count"),
    downloadCount: integer("download_count").notNull().default(0),
    decidedAt: integer("decided_at"),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [
    index("download_request_grant_idx").on(t.grantId, t.state, t.createdAt),
    index("download_request_org_idx").on(t.organizationId, t.state, t.createdAt),
  ],
);

/** Welcome collage: a small JPEG (<= 2 MB, EXIF-free) the photographer
 * attaches to a gallery. Created on upload, referenced by
 * share_grant.welcome_image_id, served through a signed, grant-coupled URL
 * (lib/welcome-link.ts) so revoking the gallery kills it. */
export const welcomeImages = sqliteTable(
  "welcome_image",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull(),
    bytes: integer("bytes").notNull(),
    createdAt: ts("created_at"),
  },
  (t) => [index("welcome_image_org_idx").on(t.organizationId, t.createdAt)],
);

/** WEB-266: gallery guests — email-capture gate visitors + pre-registration
 * list; warm leads the studio can export or convert. */
export const galleryGuests = sqliteTable(
  "gallery_guest",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    grantId: text("grant_id")
      .notNull()
      .references(() => shareGrants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    /** guest | preregistered */
    kind: text("kind").notNull().default("guest"),
    notifiedAt: integer("notified_at"),
    createdAt: ts("created_at"),
  },
  (t) => [uniqueIndex("gallery_guest_unique").on(t.grantId, t.email), index("gallery_guest_org_idx").on(t.organizationId, t.createdAt)],
);

/** WEB-265: per-photo interest counters (heat overlay) — upsert pattern
 * twin of gallery_view_monthly, keyed by asset+month. */
export const assetViewMonthly = sqliteTable(
  "asset_view_monthly",
  {
    organizationId: text("organization_id").notNull(),
    grantId: text("grant_id").notNull(),
    assetId: text("asset_id").notNull(),
    month: text("month").notNull(),
    views: integer("views").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.grantId, t.assetId, t.month] }),
    index("asset_view_monthly_org_idx").on(t.organizationId, t.month),
  ],
);

/** WEB-262: per-photo share tokens — children of the gallery grant. The
 * parent's status/expiry/sharing-toggle is re-checked on every resolve, so
 * revoking or regenerating the gallery kills every photo link with it. */
export const photoShares = sqliteTable(
  "photo_share",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    grantId: text("grant_id")
      .notNull()
      .references(() => shareGrants.id, { onDelete: "cascade" }),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    tokenEnc: text("token_enc").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at"),
  },
  (t) => [
    index("photo_share_grant_idx").on(t.grantId, t.createdAt),
    index("photo_share_asset_idx").on(t.assetId),
  ],
);

/** WEB-263: one-time codes for the client home (/my) — keyed by hashed
 * email, capped + short-lived like the gallery OTPs. */
export const myOtp = sqliteTable(
  "my_otp",
  {
    id: text("id").primaryKey(),
    emailHash: text("email_hash").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
    createdAt: ts("created_at"),
  },
  (t) => [index("my_otp_email_idx").on(t.emailHash, t.createdAt)],
);

export const shareGrantAssets = sqliteTable(
  "share_grant_asset",
  {
    grantId: text("grant_id")
      .notNull()
      .references(() => shareGrants.id, { onDelete: "cascade" }),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    addedAt: ts("added_at"),
    /** WEB-216: folder label frozen at delivery — post-delivery renames and
     * reorgs never change what a live gallery shows. */
    folderName: text("folder_name"),
    /** Photo order inside this delivered gallery (ascending, gap-spaced -
     * lib/gallery-order.ts). */
    position: integer("position").notNull().default(0),
  },
  (t) => [
    index("share_grant_asset_pk_idx").on(t.grantId, t.assetId),
    index("share_grant_asset_order_idx").on(t.grantId, t.position),
    index("share_grant_asset_asset_idx").on(t.assetId),
  ],
);

/* ---------------- Client favorites & selections (WEB-209 P1) ---------------- */

/** WEB-264: named favorite lists per grant (the default list is created
 * lazily per grant; legacy favorites backfilled into it by 0046). */
export const favoriteLists = sqliteTable(
  "favorite_list",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    grantId: text("grant_id")
      .notNull()
      .references(() => shareGrants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: ts("created_at"),
  },
  (t) => [index("favorite_list_grant_idx").on(t.grantId)],
);

export const galleryFavorites = sqliteTable(
  "gallery_favorite",
  {
    grantId: text("grant_id")
      .notNull()
      .references(() => shareGrants.id, { onDelete: "cascade" }),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    listId: text("list_id")
      .notNull()
      .references(() => favoriteLists.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** WEB-264: per-photo note (plain text, ≤280, photographer-only). */
    note: text("note"),
    createdAt: ts("created_at"),
  },
  (t) => [primaryKey({ columns: [t.grantId, t.assetId, t.listId] }), index("gallery_favorite_asset_idx").on(t.organizationId, t.assetId)],
);

export const gallerySelections = sqliteTable(
  "gallery_selection",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    grantId: text("grant_id")
      .notNull()
      .references(() => shareGrants.id, { onDelete: "cascade" }),
    clientEmail: text("client_email").notNull(),
    note: text("note"),
    /** JSON array of asset ids. */
    itemsJson: text("items_json").notNull(),
    submittedAt: ts("submitted_at"),
    /** WEB-264: studio's completion flag — stale selections stay obvious. */
    seen: integer("seen", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("gallery_selection_grant_idx").on(t.grantId, t.submittedAt)],
);

export const shareAccessLogs = sqliteTable(
  "share_access_log",
  {
    id: text("id").primaryKey(),
    grantId: text("grant_id")
      .notNull()
      .references(() => shareGrants.id, { onDelete: "cascade" }),
    /** view | otp_sent | otp_success | otp_fail | download */
    event: text("event").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: ts("created_at"),
  },
  (t) => [index("share_access_log_grant_idx").on(t.grantId, t.createdAt)],
);

/* Gallery OTP gate — hashed 6-digit codes bound to a grant, plus a send log
 * that enforces the email-cost caps (WEB-132 worst-case guardrails). */

export const shareOtp = sqliteTable(
  "share_otp",
  {
    id: text("id").primaryKey(),
    grantId: text("grant_id")
      .notNull()
      .references(() => shareGrants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    createdAt: ts("created_at"),
  },
  (t) => [index("share_otp_grant_idx").on(t.grantId, t.createdAt)],
);

export const shareOtpLog = sqliteTable(
  "share_otp_log",
  {
    id: text("id").primaryKey(),
    grantId: text("grant_id")
      .notNull()
      .references(() => shareGrants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    ip: text("ip"),
    createdAt: ts("created_at"),
  },
  (t) => [
    index("share_otp_log_email_idx").on(t.email, t.createdAt),
    index("share_otp_log_ip_idx").on(t.ip, t.createdAt),
  ],
);

/* ---------------- Money ---------------- */

export const payments = sqliteTable(
  "payment",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    /** WEB-352: the studio's connected account the charge was made on (refunds
     * run there). NULL = legacy payment taken on the platform account. */
    stripeAccountId: text("stripe_account_id"),
    /** booking | deposit | balance | manual */
    kind: text("kind").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("usd"),
    /** pending | succeeded | failed | refunded */
    status: text("status").notNull().default("pending"),
    occurredAt: integer("occurred_at", { mode: "timestamp" }),
    /** WEB-135: manual/offline records — cash, e-transfer, cheque, other. */
    method: text("method"),
    note: text("note"),
    createdAt: ts("created_at"),
  },
  (t) => [index("payment_org_project_idx").on(t.organizationId, t.projectId)],
);

export const invoices = sqliteTable(
  "invoice",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Sequential per studio (per-org counter, transaction-safe). */
    number: text("number").notNull(),
    /** draft | sent | paid | void */
    status: text("status").notNull().default("draft"),
    /** JSON array of line items */
    lines: text("lines").notNull().default("[]"),
    totalMinor: integer("total_minor").notNull().default(0),
    currency: text("currency").notNull().default("usd"),
    issuedAt: integer("issued_at", { mode: "timestamp" }),
    dueAt: integer("due_at", { mode: "timestamp" }),
    /** R2 key of the generated branded PDF (org-prefixed). */
    pdfKey: text("pdf_key"),
    /** WEB-252 snapshots — frozen at creation so old invoices never change. */
    taxLabel: text("tax_label"),
    taxRateBps: integer("tax_rate_bps"),
    terms: text("terms"),
    memo: text("memo"),
    /** WEB-137: recipient + secure-link token (grant pattern: hash lookup). */
    clientEmail: text("client_email"),
    accessTokenHash: text("access_token_hash"),
    tokenEnc: text("token_enc"),
    /** WEB-174: Stripe Payment Link for the invoice total (persistent URL). */
    paymentUrl: text("payment_url"),
    stripePaymentLinkId: text("stripe_payment_link_id"),
    createdAt: ts("created_at"),
  },
  (t) => [uniqueIndex("invoice_org_number_unique").on(t.organizationId, t.number)],
);

/* ---------------- Contracts & e-signatures (WEB-158) ---------------- */

export const contracts = sqliteTable(
  "contract",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Merge-field template while draft; merged text once sent. */
    body: text("body").notNull(),
    /** draft | sent | signed | void */
    status: text("status").notNull().default("draft"),
    clientEmail: text("client_email"),
    accessTokenHash: text("access_token_hash"),
    tokenEnc: text("token_enc"),
    sentAt: integer("sent_at", { mode: "timestamp" }),
    signedAt: integer("signed_at", { mode: "timestamp" }),
    signerName: text("signer_name"),
    signerIp: text("signer_ip"),
    signerUserAgent: text("signer_user_agent"),
    /** R2 key of the signed PDF (org-prefixed). */
    pdfKey: text("pdf_key"),
    createdAt: ts("created_at"),
  },
  (t) => [index("contract_org_project_idx").on(t.organizationId, t.projectId)],
);

/* ---------------- Form responses / questionnaires (WEB-248) ---------------- */

export const formResponses = sqliteTable(
  "form_response",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    templateId: text("template_id").notNull(),
    /** JSON: { answers: {fieldId: string|boolean}, files: {fieldId: {key,name,bytes}} } */
    answers: text("answers"),
    clientEmail: text("client_email"),
    accessTokenHash: text("access_token_hash"),
    tokenEnc: text("token_enc"),
    submittedAt: integer("submitted_at", { mode: "timestamp" }),
    createdAt: ts("created_at"),
  },
  (t) => [index("form_response_org_project_idx").on(t.organizationId, t.projectId)],
);

/** Per-org sequential counters (invoice numbering). */
export const orgCounters = sqliteTable("org_counter", {
  organizationId: text("organization_id").primaryKey(),
  invoiceSeq: integer("invoice_seq").notNull().default(0),
  /** WEB-252 reset-yearly numbering: the year the year-seq belongs to. */
  invoiceYear: text("invoice_year"),
  invoiceYearSeq: integer("invoice_year_seq").notNull().default(0),
});

/** WEB-284: system-wide key/value state — rate-limit gates for the cron and
 * restore endpoints (value holds an epoch-seconds timestamp). */
export const systemState = sqliteTable("system_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});


/* ---------------- Session types (WEB-250) ---------------- */

export const sessionTypes = sqliteTable(
  "session_type",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    color: text("color"),
    icon: text("icon"),
    slotMinutes: integer("slot_minutes"),
    bufferMinutes: integer("buffer_minutes"),
    minLeadHours: integer("min_lead_hours"),
    maxAdvanceDays: integer("max_advance_days"),
    priceMinor: integer("price_minor"),
    /** null = inherit org payment; 'off' | 'deposit' | 'full'. */
    depositKind: text("deposit_kind"),
    depositMinor: integer("deposit_minor"),
    /** inherit (own rules + shared) | own (only this type's rules). */
    availabilityMode: text("availability_mode").notNull().default("inherit"),
    bookingFormTemplateId: text("booking_form_template_id"),
    galleryDefaults: text("gallery_defaults").notNull().default("{}"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [uniqueIndex("session_type_org_slug_unique").on(t.organizationId, t.slug)],
);

/* ---------------- Template store (WEB-247) ---------------- */

/** WEB-259: BYO slideshow music — one org-level library, reused across
 * galleries. No catalog: studios warrant rights at upload (audit-logged). */
export const slideshowTracks = sqliteTable(
  "slideshow_track",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    mimeType: text("mime_type").notNull(),
    bytes: integer("bytes").notNull(),
    createdAt: ts("created_at"),
  },
  (t) => [index("slideshow_track_org_idx").on(t.organizationId, t.createdAt)],
);

export const templates = sqliteTable(
  "template",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** contract | form | email_snippet | invoice_preset | questionnaire */
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    /** JSON (form-like kinds) or sanitized HTML / plain text (documents). */
    body: text("body").notNull(),
    /** Kind-specific config (email subject, invoice terms…). */
    meta: text("meta").notNull().default("{}"),
    isDefault: integer("is_default").notNull().default(0),
    archivedAt: integer("archived_at", { mode: "timestamp" }),
    /** WEB-255: set when a client submits through / the studio applies this template. */
    lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [index("template_org_kind_idx").on(t.organizationId, t.kind, t.archivedAt)],
);


/* ---------------- Logs ---------------- */

export const emailLog = sqliteTable(
  "email_log",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    toEmail: text("to_email").notNull(),
    template: text("template").notNull(),
    refType: text("ref_type"),
    refId: text("ref_id"),
    providerId: text("provider_id"),
    status: text("status").notNull().default("sent"),
    createdAt: ts("created_at"),
  },
  (t) => [index("email_log_org_idx").on(t.organizationId, t.createdAt)],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    /** user | client | system */
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    meta: text("meta").notNull().default("{}"),
    createdAt: ts("created_at"),
  },
  (t) => [index("audit_log_org_idx").on(t.organizationId, t.createdAt)],
);

/* ---------------- Gallery view rate limiting (WEB-160) ---------------- */

/** Fixed 60s windows per IP; counters, not logs (one row per IP-minute). */
export const viewRateWindows = sqliteTable(
  "view_rate_window",
  {
    ip: text("ip").notNull(),
    windowStart: integer("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.ip, t.windowStart] })],
);

/** Monthly per-gallery view rollup — the budget counter AND the per-org
 * usage source for margin monitoring (WEB-161). */
export const galleryViewMonthly = sqliteTable(
  "gallery_view_monthly",
  {
    organizationId: text("organization_id").notNull(),
    grantId: text("grant_id").notNull(),
    /** 'YYYY-MM' */
    month: text("month").notNull(),
    views: integer("views").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.grantId, t.month] }),
    index("gallery_view_monthly_org_idx").on(t.organizationId, t.month),
  ],
);

/* ---------------- Usage snapshots / margin monitoring (WEB-161) ---------------- */

/** Month-to-date usage per org, refreshed daily by the cron; the month key
 * rolls over so the last write of a month freezes its snapshot. */
export const usageCounters = sqliteTable(
  "usage_counters",
  {
    organizationId: text("organization_id").notNull(),
    /** 'YYYY-MM' */
    month: text("month").notNull(),
    storedBytes: integer("stored_bytes").notNull().default(0),
    imageViews: integer("image_views").notNull().default(0),
    emailsSent: integer("emails_sent").notNull().default(0),
    uploadOps: integer("upload_ops").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.month] }),
    index("usage_counters_month_idx").on(t.month),
  ],
);

/* ---------------- Presigned upload sessions (WEB-111) ---------------- */

/** Browser→R2 direct uploads: the session mints the asset key + presigned
 * URL(s); the asset row only exists once /api/uploads/confirm has verified
 * the object (size + magic bytes). Expired sessions are aborted by the cron. */
export const uploadSessions = sqliteTable(
  "upload_session",
  {
    /** = the future asset id — the client references it through confirm/abort. */
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique(),
    /** single | multipart */
    mode: text("mode").notNull(),
    /** S3 uploadId — multipart only. */
    uploadId: text("upload_id"),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    declaredBytes: integer("declared_bytes").notNull(),
    /** image | video | raw — re-verified against magic bytes on confirm. */
    kind: text("kind").notNull(),
    uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull(),
    /** Epoch seconds — the cron aborts multipart uploads past this. */
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("upload_session_org_idx").on(t.organizationId, t.createdAt)],
);

/* ---------------- Inbox (WEB-303/304) — Linear-style per-user view ----------------
 * The inbox is a view over events, never a duplicate store: entities live in
 * their own tables; inbox_item carries only per-user read/snooze/deleted
 * state. Conversations live in thread/thread_message (bodies in R2 — D1 rows
 * cap at 2 MB); DDL: migrations/0057_inbox.sql. */

export const threads = sqliteTable(
  "thread",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    subject: text("subject").notNull().default(""),
    clientEmail: text("client_email").notNull(),
    clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
    leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    /** Direction of the newest message — drives the needs-reply filter. */
    lastDirection: text("last_direction"),
    /** WEB-307: base64 Thread-Index we emit for this conversation (22 bytes:
     * 6-byte clock + stable 16-byte GUID; inbound matches on the GUID). */
    threadIndex: text("thread_index"),
    /** WEB-307: token for the per-thread reply address t-{id}-{token}@. */
    addressToken: text("address_token"),
    lastActivityAt: ts("last_activity_at"),
    createdAt: ts("created_at"),
  },
  (t) => [
    index("thread_org_client_idx").on(t.organizationId, t.clientEmail, t.lastActivityAt),
    index("thread_org_activity_idx").on(t.organizationId, t.lastActivityAt),
  ],
);

export const threadMessages = sqliteTable(
  "thread_message",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** in | out */
    direction: text("direction").notNull(),
    /** RFC 5322 Message-ID — the threading lookup key; UNIQUE collapses
     * webhook-retry duplicates before they reach the conversation. */
    rfcMessageId: text("rfc_message_id").unique(),
    inReplyTo: text("in_reply_to"),
    referencesChain: text("references_chain"),
    fromAddr: text("from_addr").notNull().default(""),
    subject: text("subject").notNull().default(""),
    /** Full stripped body text (≤8 KB) until WEB-307 moves bodies to R2 —
     * list surfaces truncate to their own preview caps. */
    textPreview: text("text_preview").notNull().default(""),
    /** R2 keys — sanitized HTML + raw .eml (WEB-307 fills them; today's
     * lead ingest keeps body text in lead_message as before). */
    htmlR2Key: text("html_r2_key"),
    rawR2Key: text("raw_r2_key"),
    hasAttachments: integer("has_attachments", { mode: "boolean" }).notNull().default(false),
    /** received | sent | failed */
    status: text("status").notNull().default("received"),
    createdAt: ts("created_at"),
  },
  (t) => [index("thread_message_thread_idx").on(t.threadId, t.createdAt)],
);

export const inboxItems = sqliteTable(
  "inbox_item",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** email | booking | contract | invoice | gallery | order | lead */
    kind: text("kind").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    /** Set when the event belongs to a client conversation; NULL = needs
     * triage (unmatched inbound, WEB-307 mints those). */
    threadId: text("thread_id").references(() => threads.id, { onDelete: "set null" }),
    title: text("title").notNull().default(""),
    preview: text("preview").notNull().default(""),
    /** Per-user state only — the entity itself is never mutated. */
    readAt: integer("read_at"),
    snoozedUntil: integer("snoozed_until"),
    deletedAt: integer("deleted_at"),
    createdAt: ts("created_at"),
  },
  (t) => [
    index("inbox_item_user_stream_idx").on(t.userId, t.deletedAt, t.createdAt),
    index("inbox_item_user_read_idx").on(t.userId, t.readAt),
    uniqueIndex("inbox_item_user_entity_unique")
      .on(t.userId, t.entityType, t.entityId)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

/* ---------------- Client portal auth (WEB-131) ---------------- */

/** Magic-code login for portal clients — email-scoped, latest code wins. */
export const portalOtp = sqliteTable(
  "portal_otp",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    createdAt: ts("created_at"),
  },
  (t) => [index("portal_otp_email_idx").on(t.email, t.createdAt)],
);

/** Delivered-code log — caps count sent emails only. */
export const portalOtpLog = sqliteTable(
  "portal_otp_log",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    ip: text("ip"),
    createdAt: ts("created_at"),
  },
  (t) => [
    index("portal_otp_log_email_idx").on(t.email, t.createdAt),
    index("portal_otp_log_ip_idx").on(t.ip, t.createdAt),
  ],
);
