-- 0008: curation tags (Epic 8) — favorite + custom tags per asset, org-scoped.
-- Approved/rejected remain the asset STATUS (existing); this table adds the
-- long tail (favorite, client-picks, custom labels) + smart-filter targets.
CREATE TABLE IF NOT EXISTS asset_tag (
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (asset_id, tag)
);
CREATE INDEX IF NOT EXISTS asset_tag_org_tag_idx ON asset_tag(organization_id, tag);
