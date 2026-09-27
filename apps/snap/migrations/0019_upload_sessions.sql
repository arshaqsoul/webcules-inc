-- 0019: Presigned upload sessions (WEB-111). Browser→R2 direct uploads —
-- bytes never transit the Worker. The session holds the minted key and
-- (multipart) the S3 uploadId between "create" and "confirm"; the asset row
-- is only written after confirm verifies size + magic bytes.
CREATE TABLE upload_session (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  /** single | multipart */
  mode TEXT NOT NULL,
  upload_id TEXT,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  declared_bytes INTEGER NOT NULL,
  kind TEXT NOT NULL,
  uploaded_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL
);
CREATE INDEX upload_session_org_idx ON upload_session(organization_id, created_at);
