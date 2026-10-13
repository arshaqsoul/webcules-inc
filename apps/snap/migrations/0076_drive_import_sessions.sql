-- WEB-183 (Integrations 4/6): explicit import sessions for browser-relayed
-- imports (Google Drive first). Each import opens a session row at pick time
-- (source + the picked external files) and closes it with per-file outcomes,
-- so relayed imports are auditable and distinct from plain uploads: what was
-- picked, what landed, what was skipped as a duplicate, what failed. Bytes
-- never touch the Worker (browser relay) — this table is bookkeeping only.
CREATE TABLE import_session (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  /** 'google_drive' (Picker + drive.file browser relay). */
  source TEXT NOT NULL,
  created_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  /** Picked files recorded when the session opened. */
  picked TEXT NOT NULL DEFAULT '[]',
  file_count INTEGER NOT NULL,
  /** open | complete (open sessions older than a day are effectively
   * abandoned — the client closed the tab mid-import; nothing sweeps yet). */
  status TEXT NOT NULL DEFAULT 'open',
  imported_count INTEGER,
  skipped_count INTEGER,
  failed_count INTEGER,
  /** JSON per-file outcomes, written at close:
   * [{driveFileId, outcome: imported|skipped_duplicate|skipped|failed}]. */
  detail TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER
);
CREATE INDEX import_session_org_idx ON import_session(organization_id, created_at);
CREATE INDEX import_session_project_idx ON import_session(project_id, created_at);
