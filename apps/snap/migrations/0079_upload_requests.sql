-- WEB-182 (Integrations 5/6): client-upload collaboration links — the
-- demand gap (only VSCO/SmugMug had guest uploads). A studio mints a
-- tokenized upload-request link for a project; guests/clients (wedding
-- guests sharing phone photos, clients uploading) upload through the
-- public /u/{token} page; every file lands in QUARANTINE — an ordinary
-- asset row that is deliberately NOT in any share_grant_assets set, so no
-- client link can see it — until the studio approves (optionally
-- publishing straight into the linked client gallery) or rejects.
--
-- Token handling mirrors share_grant exactly: only the SHA-256 hash
-- (lookup key) plus an AES-GCM token_enc (re-display without rotating) are
-- stored; the raw token exists only in the HTTP response + email.
CREATE TABLE upload_request (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  /** Optional client gallery approvals are published into (share_grant.id).
   * SET NULL: closing the gallery never kills the upload link. */
  grant_id TEXT REFERENCES share_grant(id) ON DELETE SET NULL,
  /** Studio-facing label, e.g. "Smith Wedding — guest photos". */
  title TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_enc TEXT NOT NULL,
  /** open | closed (closed refuses new uploads; submissions stay reviewable). */
  status TEXT NOT NULL DEFAULT 'open',
  /** Epoch seconds; null = never expires. */
  expires_at INTEGER,
  /** Studio-set per-link file cap; null = uncapped (REQUEST_FILE_HARD_CAP still applies). */
  max_files INTEGER,
  /** Confirmed uploads through this link (pending + decided). */
  uploaded_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  /** Studio-notification throttle: last "uploads await review" email, epoch seconds. */
  last_notified_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  closed_at INTEGER
);
CREATE INDEX upload_request_org_idx ON upload_request(organization_id, created_at);
CREATE INDEX upload_request_project_idx ON upload_request(project_id, created_at);

-- Quarantine + decision bookkeeping: one row per guest-uploaded file.
-- status pending | approved | rejected; the asset row itself only flips to
-- the studio culling statuses (approved/rejected) when decided here, and
-- approval is what (optionally) appends the asset to the linked grant.
CREATE TABLE upload_request_asset (
  id TEXT PRIMARY KEY,
  upload_request_id TEXT NOT NULL REFERENCES upload_request(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  /** Free-text display name the guest typed on the upload page (optional). */
  uploader_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  decided_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  decided_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX upload_request_asset_uniq ON upload_request_asset(upload_request_id, asset_id);
CREATE INDEX upload_request_asset_req_idx ON upload_request_asset(upload_request_id, status, created_at);
CREATE INDEX upload_request_asset_org_idx ON upload_request_asset(organization_id, created_at);
