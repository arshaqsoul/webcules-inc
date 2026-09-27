-- Client selections v1 (WEB-209 P1): favorites + limited selections.
-- selection_mode on the grant: off | favorites | selection.
CREATE TABLE gallery_favorite (
  grant_id TEXT NOT NULL REFERENCES share_grant(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (grant_id, asset_id)
);
CREATE INDEX gallery_favorite_asset_idx ON gallery_favorite(organization_id, asset_id);

CREATE TABLE gallery_selection (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  grant_id TEXT NOT NULL REFERENCES share_grant(id) ON DELETE CASCADE,
  client_email TEXT NOT NULL,
  note TEXT,
  items_json TEXT NOT NULL,
  submitted_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX gallery_selection_grant_idx ON gallery_selection(grant_id, submitted_at);

ALTER TABLE share_grant ADD COLUMN selection_mode TEXT NOT NULL DEFAULT 'favorites';
ALTER TABLE share_grant ADD COLUMN selection_limit INTEGER;
ALTER TABLE share_grant ADD COLUMN selection_deadline INTEGER;
