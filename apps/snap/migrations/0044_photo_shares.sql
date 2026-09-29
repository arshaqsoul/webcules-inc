-- WEB-262 social sharing: per-photo share tokens — children of the client's
-- gallery grant (revocation/expiry/regeneration of the parent kills them at
-- resolve time) — plus the per-gallery "allow social sharing" toggle
-- (default ON).
CREATE TABLE photo_share (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  grant_id TEXT NOT NULL REFERENCES share_grant(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  token_enc TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX photo_share_grant_idx ON photo_share(grant_id, created_at);
CREATE INDEX photo_share_asset_idx ON photo_share(asset_id);

ALTER TABLE share_grant ADD COLUMN allow_sharing INTEGER NOT NULL DEFAULT 1;
