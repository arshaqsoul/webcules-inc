import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/* ---------------- Better Auth tables ---------------- */

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
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
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
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
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

/* ---------------- Webcules CRM ---------------- */

export type Stage = "lead" | "redesigned" | "contacted" | "negotiating" | "won" | "live" | "lost";

export const leads = sqliteTable(
  "leads",
  {
    id: text("id").primaryKey(),
    business: text("business").notNull(),
    industry: text("industry").default(""),
    city: text("city").notNull().default("Saskatoon, SK"),
    siteUrl: text("site_url").default(""),
    contactName: text("contact_name").default(""),
    email: text("email").default(""),
    phone: text("phone").default(""),
    stage: text("stage").$type<Stage>().notNull().default("lead"),
    source: text("source").default(""),
    notes: text("notes").default(""),
    lastTouchAt: integer("last_touch_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (t) => [index("leads_stage_idx").on(t.stage)],
);

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  leadId: text("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  previewUrl: text("preview_url").default(""),
  repoUrl: text("repo_url").default(""),
  pages: integer("pages").default(5),
  tier: text("tier").default("standard"),
  quoteOneTime: integer("quote_one_time").notNull().default(799), // CAD dollars
  quoteMaintenance: integer("quote_maintenance").notNull().default(10), // CAD dollars / month
  marketLow: integer("market_low").notNull().default(2500),
  marketHigh: integer("market_high").notNull().default(4500),
  gradeJson: text("grade_json").default("{}"), // {uiux, conversion, ai}
  findingsJson: text("findings_json").default("[]"), // [{severity, lens, title, cost, fix}]
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const outreach = sqliteTable(
  "outreach",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    channel: text("channel").$type<"email" | "whatsapp" | "call" | "meeting" | "note">().notNull(),
    kind: text("kind").$type<"pitch" | "followup" | "reply" | "note">().notNull().default("note"),
    subject: text("subject").default(""),
    body: text("body").default(""),
    status: text("status").$type<"draft" | "sent" | "replied" | "ignored">().notNull().default("sent"),
    sentAt: integer("sent_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (t) => [index("outreach_lead_idx").on(t.leadId)],
);

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
    kind: text("kind").$type<"one_time" | "maintenance" | "other">().notNull(),
    method: text("method").$type<"stripe" | "etransfer" | "cash" | "other">().notNull(),
    amountCents: integer("amount_cents").notNull(), // CAD cents
    currency: text("currency").notNull().default("CAD"),
    status: text("status").$type<"pending" | "paid" | "refunded">().notNull().default("paid"),
    stripeRef: text("stripe_ref").default(""),
    note: text("note").default(""),
    paidAt: integer("paid_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (t) => [index("payments_lead_idx").on(t.leadId)],
);

export const subscriptions = sqliteTable("subscriptions", {
  id: text("id").primaryKey(),
  leadId: text("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  stripeSubscriptionId: text("stripe_subscription_id").default(""),
  status: text("status").notNull().default("active"), // active | past_due | canceled | manual
  priceMonthlyCents: integer("price_monthly_cents").notNull().default(1000),
  currentPeriodEnd: integer("current_period_end", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});
