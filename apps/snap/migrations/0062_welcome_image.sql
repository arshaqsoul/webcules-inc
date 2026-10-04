-- Welcome collage: an optional image the photographer attaches to a gallery.
-- It heads the "your photos are ready" email and the top of the gallery.
-- Rows are created on upload (unattached), attached to a gallery on send, and
-- swept when nothing references them. A renewed link points at the same row.
CREATE TABLE welcome_image (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX welcome_image_org_idx ON welcome_image(organization_id, created_at);
ALTER TABLE share_grant ADD COLUMN welcome_image_id TEXT;
CREATE INDEX share_grant_welcome_idx ON share_grant(welcome_image_id);
