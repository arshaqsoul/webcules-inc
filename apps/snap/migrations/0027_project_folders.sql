-- 0027: project folders (WEB-216) — structural one-home grouping for
-- delivery, distinct from asset_tag's many-to-many curation vocabulary.
-- Flat per project in v1 (parent stays NULL); folder ops move pointers,
-- never bytes — storage keys and R2 objects are untouched.
CREATE TABLE IF NOT EXISTS folder (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS folder_org_project_idx ON folder(organization_id, project_id, sort);
-- One folder per name per project, case-insensitive ("Wedding" vs "wedding"
-- would split drops between two rails).
CREATE UNIQUE INDEX IF NOT EXISTS folder_project_name_uniq ON folder(project_id, name COLLATE NOCASE);

ALTER TABLE asset ADD COLUMN folder_id TEXT REFERENCES folder(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS asset_folder_idx ON asset(folder_id);

-- Delivery snapshot: the folder label a client gallery groups by is frozen
-- at grant creation, so post-delivery renames/deletes/reorgs never change
-- what a live gallery shows (the asset set is already snapshotted the same
-- way via share_grant_asset rows).
ALTER TABLE share_grant_asset ADD COLUMN folder_name TEXT;
