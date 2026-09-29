-- WEB-261 downloads 2.0: per-gallery download controls (PIN / limit /
-- approval / web-size) as validated JSON on the grant, the async ZIP
-- request pipeline (built by the daily cron, never in the request path),
-- and a once-per-grant expiry reminder stamp.
CREATE TABLE download_request (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  grant_id TEXT NOT NULL REFERENCES share_grant(id) ON DELETE CASCADE,
  client_email TEXT NOT NULL,
  -- all | favorites | photos | folder
  scope TEXT NOT NULL DEFAULT 'all',
  -- WEB-216 frozen folder label when scope = 'folder'
  folder_name TEXT,
  -- JSON asset id array when scope = 'photos'
  asset_ids TEXT,
  -- full | web
  size_pref TEXT NOT NULL DEFAULT 'full',
  -- requested → approved/rejected → zipping → ready → delivered | expired | failed
  state TEXT NOT NULL DEFAULT 'requested',
  note TEXT,
  zip_key TEXT,
  zip_bytes INTEGER,
  file_count INTEGER,
  download_count INTEGER NOT NULL DEFAULT 0,
  decided_at INTEGER,
  built_at INTEGER,
  -- ZIP TTL (7 days after build)
  expires_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX download_request_grant_idx ON download_request(grant_id, state, created_at);
CREATE INDEX download_request_org_idx ON download_request(organization_id, state, created_at);

ALTER TABLE share_grant ADD COLUMN download_settings TEXT;
ALTER TABLE share_grant ADD COLUMN expiry_reminded_at INTEGER;
