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
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

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
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [uniqueIndex("organization_slug_unique").on(t.slug)],
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
  /** JSON: booking rules snapshot (slot length default, buffers, lead time) */
  bookingSettings: text("booking_settings").notNull().default("{}"),
  /** Public, rotatable embed key — resolves widgets to this studio. */
  embedKey: text("embed_key").unique(),
  /** JSON array of allowed embed origins (CSP frame-ancestors + Origin check). */
  embedOrigins: text("embed_origins").notNull().default("[]"),
  /** JSON: { enabled: bool, retainDays?: number } — rejected auto-delete policy */
  rejectedPolicy: text("rejected_policy").notNull().default('{"enabled":false}'),
  exifStripDerived: integer("exif_strip_derived", { mode: "boolean" }).notNull().default(false),
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
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

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
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [
    uniqueIndex("client_org_email_unique").on(t.organizationId, t.email),
    index("client_user_idx").on(t.userId),
  ],
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
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [index("booking_org_start_idx").on(t.organizationId, t.startAt)],
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
    checksum: text("checksum"),
    /** uploaded | approved | rejected | shared */
    status: text("status").notNull().default("uploaded"),
    thumbKey: text("thumb_key"),
    previewKey: text("preview_key"),
    exifStripped: integer("exif_stripped", { mode: "boolean" }).notNull().default(false),
    uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: ts("created_at"),
    /* RAW Vault (WEB-153) — epoch seconds, null = stage not reached. */
    rawArchivedAt: integer("raw_archived_at"),
    rawKeepUntil: integer("raw_keep_until"),
    rawNoticeAt: integer("raw_notice_at"),
    rawPurgeWarn1At: integer("raw_purge_warn1_at"),
    rawPurgeWarn2At: integer("raw_purge_warn2_at"),
  },
  (t) => [
    index("asset_org_project_idx").on(t.organizationId, t.projectId, t.createdAt),
    index("asset_raw_scan_idx").on(t.kind, t.createdAt),
    index("asset_raw_archive_idx").on(t.rawArchivedAt),
  ],
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
    createdAt: ts("created_at"),
  },
  (t) => [index("share_grant_org_project_idx").on(t.organizationId, t.projectId, t.status)],
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
  },
  (t) => [
    index("share_grant_asset_pk_idx").on(t.grantId, t.assetId),
    index("share_grant_asset_asset_idx").on(t.assetId),
  ],
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
    /** WEB-137: recipient + secure-link token (grant pattern: hash lookup). */
    clientEmail: text("client_email"),
    accessTokenHash: text("access_token_hash"),
    tokenEnc: text("token_enc"),
    createdAt: ts("created_at"),
  },
  (t) => [uniqueIndex("invoice_org_number_unique").on(t.organizationId, t.number)],
);

/** Per-org sequential counters (invoice numbering). */
export const orgCounters = sqliteTable("org_counter", {
  organizationId: text("organization_id").primaryKey(),
  invoiceSeq: integer("invoice_seq").notNull().default(0),
});


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
