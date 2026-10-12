-- WEB-185 (Integrations 2/6): publish-state ledger for the Lightroom
-- Classic publish plugin. One row per (project, source, external photo id):
-- the plugin reports the Lightroom catalog's local identifier plus a content
-- signature (develop/crop/export state hash) at publish time. The upsert on
-- (project_id, source, external_photo_id) is what makes re-publish sync work:
-- a re-published photo replaces the asset bytes and refreshes the signature,
-- and the plugin can diff its local signatures against this table to decide
-- which photos Lightroom should mark "Changed". asset_id cascade: deleting the
-- asset (unpublish, project delete) removes the ledger row, never vice versa.
CREATE TABLE integration_publish (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  external_photo_id TEXT NOT NULL,
  signature TEXT NOT NULL,
  token_id TEXT REFERENCES integration_token(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX integration_publish_unique_idx
  ON integration_publish(project_id, source, external_photo_id);
CREATE INDEX integration_publish_org_idx
  ON integration_publish(organization_id, source, updated_at);
