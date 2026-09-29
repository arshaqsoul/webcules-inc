-- WEB-259 slideshows: BYO music library (org-level, stored once, reused
-- across galleries) + per-project slideshow config. No catalog, no license
-- on snap's books — studios warrant rights at upload (audit-logged).
CREATE TABLE slideshow_track (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX slideshow_track_org_idx ON slideshow_track(organization_id, created_at);

-- Slideshow config JSON (enabled/pace/transition/music track + start
-- offset), <= 2 KB, app-validated. NULL = no slideshow button.
ALTER TABLE project ADD COLUMN gallery_slideshow TEXT;
