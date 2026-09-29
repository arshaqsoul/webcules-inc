-- 0029: custom domains (WEB-224/225) — per-org hostnames serving the client
-- surface (galleries, booking, portal). Soft-delete only (removed_at — the
-- WEB-152 no-data-loss rule); a removed hostname frees its claim so another
-- studio can take it after publishing their own TXT token. Status lifecycle:
-- pending_verification → verified → cert_pending → active, with degraded /
-- failed / suspended_entitlement / removed as exits (owners: repo + sweep).
CREATE TABLE custom_domain (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  hostname TEXT NOT NULL,              -- normalized: lowercase, no scheme/path/trailing dot
  is_primary INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending_verification',
  verification_token TEXT NOT NULL,    -- "snap-verify=<32 hex>" TXT value
  verification_expires_at INTEGER,     -- created_at + 30d; cron expires stale pendings
  cf_custom_hostname_id TEXT,          -- Cloudflare Custom Hostnames API id
  cert_status TEXT,                    -- CF ssl.status string, mirrored for UI
  dcv_txt_name TEXT,                   -- CF DCV TXT record name (cert validation)
  dcv_txt_value TEXT,                  -- CF DCV TXT record value
  last_error TEXT,                     -- human-readable last failure (DNS, CAA, ...)
  last_checked_at INTEGER,
  last_notified_at INTEGER,            -- degraded-email throttle (sweep, 7d)
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  removed_at INTEGER
);
CREATE UNIQUE INDEX custom_domain_hostname_unique ON custom_domain(hostname) WHERE removed_at IS NULL;
CREATE INDEX custom_domain_org_idx ON custom_domain(organization_id, status);

-- Studio-tier custom-domain add-on flag (WEB-231's Stripe webhook writes it;
-- entitlements only read it). Boolean as 0/1 per repo convention.
ALTER TABLE studio_profile ADD COLUMN addon_custom_domain INTEGER NOT NULL DEFAULT 0;
