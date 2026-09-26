-- Snap 0001 — initial schema. Source of truth: Linear doc
-- "Snap · Domain Model & Data Design". Keep lib/db-schema.ts in sync.
--
-- Multi-tenancy: every tenant table carries organization_id; composite
-- indexes lead with it. Applied with:
--   wrangler d1 execute webcules-snap --local|--remote --file=./migrations/0001_init.sql

-- ---------- Better Auth core ----------
CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS session_user_idx ON session(user_id);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  password TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS account_user_idx ON account(user_id);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ---------- Better Auth organization plugin ----------
CREATE TABLE IF NOT EXISTS organization (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  logo TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS organization_slug_unique ON organization(slug);

CREATE TABLE IF NOT EXISTS member (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS member_org_user_unique ON member(organization_id, user_id);
CREATE INDEX IF NOT EXISTS member_user_idx ON member(user_id);

CREATE TABLE IF NOT EXISTS invitation (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at INTEGER NOT NULL,
  inviter_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS invitation_org_email_idx ON invitation(organization_id, email);

-- ---------- Studio profiles ----------
CREATE TABLE IF NOT EXISTS studio_profile (
  organization_id TEXT PRIMARY KEY REFERENCES organization(id) ON DELETE CASCADE,
  studio_name TEXT NOT NULL,
  contact_email TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  logo_asset_id TEXT,
  brand TEXT NOT NULL DEFAULT '{}',
  booking_settings TEXT NOT NULL DEFAULT '{}',
  embed_key TEXT UNIQUE,
  embed_origins TEXT NOT NULL DEFAULT '[]',
  rejected_policy TEXT NOT NULL DEFAULT '{"enabled":false}',
  exif_strip_derived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ---------- Clients ----------
CREATE TABLE IF NOT EXISTS client (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS client_org_email_unique ON client(organization_id, email);
CREATE INDEX IF NOT EXISTS client_user_idx ON client(user_id);

-- ---------- Leads ----------
CREATE TABLE IF NOT EXISTS lead (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  event_date INTEGER,
  event_type TEXT,
  message TEXT,
  source TEXT NOT NULL DEFAULT 'contact_form',
  status TEXT NOT NULL DEFAULT 'new',
  embed_origin TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS lead_org_status_idx ON lead(organization_id, status, created_at);

CREATE TABLE IF NOT EXISTS lead_message (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  lead_id TEXT NOT NULL REFERENCES lead(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  from_user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  subject TEXT,
  body TEXT NOT NULL,
  provider_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS lead_message_lead_idx ON lead_message(organization_id, lead_id, created_at);

-- ---------- Projects ----------
CREATE TABLE IF NOT EXISTS project (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  client_id TEXT REFERENCES client(id) ON DELETE SET NULL,
  lead_id TEXT REFERENCES lead(id) ON DELETE SET NULL,
  booking_id TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'booked',
  event_date INTEGER,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS project_org_status_idx ON project(organization_id, status, created_at);

CREATE TABLE IF NOT EXISTS project_status_event (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  note TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS pse_project_idx ON project_status_event(organization_id, project_id, created_at);

-- ---------- Availability & bookings ----------
CREATE TABLE IF NOT EXISTS availability_rule (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL,
  start_minute INTEGER NOT NULL,
  end_minute INTEGER NOT NULL,
  slot_minutes INTEGER NOT NULL DEFAULT 60,
  buffer_minutes INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS availability_org_idx ON availability_rule(organization_id, weekday);

CREATE TABLE IF NOT EXISTS blackout_date (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS blackout_org_date_unique ON blackout_date(organization_id, date);

CREATE TABLE IF NOT EXISTS booking (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES project(id) ON DELETE SET NULL,
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  client_email TEXT NOT NULL,
  client_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS booking_org_start_idx ON booking(organization_id, start_at);

-- ---------- Assets ----------
CREATE TABLE IF NOT EXISTS asset (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  bytes INTEGER NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  checksum TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded',
  thumb_key TEXT,
  preview_key TEXT,
  exif_stripped INTEGER NOT NULL DEFAULT 0,
  uploaded_by TEXT REFERENCES user(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS asset_org_project_idx ON asset(organization_id, project_id, created_at);

-- ---------- Share grants ----------
CREATE TABLE IF NOT EXISTS share_grant (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  client_email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at INTEGER,
  parent_grant_id TEXT,
  created_by_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS share_grant_org_project_idx ON share_grant(organization_id, project_id, status);

CREATE TABLE IF NOT EXISTS share_grant_asset (
  grant_id TEXT NOT NULL REFERENCES share_grant(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  added_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS share_grant_asset_pk_idx ON share_grant_asset(grant_id, asset_id);
CREATE INDEX IF NOT EXISTS share_grant_asset_asset_idx ON share_grant_asset(asset_id);

CREATE TABLE IF NOT EXISTS share_access_log (
  id TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES share_grant(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS share_access_log_grant_idx ON share_access_log(grant_id, created_at);

-- ---------- Money ----------
CREATE TABLE IF NOT EXISTS payment (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  stripe_payment_intent_id TEXT,
  kind TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending',
  occurred_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS payment_org_project_idx ON payment(organization_id, project_id);

CREATE TABLE IF NOT EXISTS invoice (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  lines TEXT NOT NULL DEFAULT '[]',
  total_minor INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  issued_at INTEGER,
  due_at INTEGER,
  pdf_key TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS invoice_org_number_unique ON invoice(organization_id, number);

-- ---------- Logs ----------
CREATE TABLE IF NOT EXISTS email_log (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organization(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  template TEXT NOT NULL,
  ref_type TEXT,
  ref_id TEXT,
  provider_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS email_log_org_idx ON email_log(organization_id, created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organization(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  ip TEXT,
  user_agent TEXT,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS audit_log_org_idx ON audit_log(organization_id, created_at);
