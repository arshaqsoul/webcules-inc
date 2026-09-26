-- Snap 0002 — better-auth 1.7.6 requirements for enabled plugins/config:
--  - organization plugin: session.activeOrganizationId
--  - rateLimit storage "database": rate_limit table
-- Applied with:
--   wrangler d1 execute webcules-snap --local|--remote --file=./migrations/0002_auth_org_ratelimit.sql

ALTER TABLE session ADD COLUMN active_organization_id TEXT;

CREATE TABLE IF NOT EXISTS rate_limit (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  last_request INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS rate_limit_key_unique ON rate_limit(key);
