-- WEB-194 email-capture gate: one row per email a guest typed to unlock
-- downloads (the studio's who-took-files list for guest galleries / minis /
-- event shares). Rows are only written by the capture route, capped per
-- grant per hour; deleting the gallery deletes its captures.
CREATE TABLE download_email_capture (
  id TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES share_grant(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX download_email_capture_grant_idx ON download_email_capture(grant_id, created_at);
