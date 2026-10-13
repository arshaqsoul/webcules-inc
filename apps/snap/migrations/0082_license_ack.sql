-- WEB-193 Downloads 3d: license acknowledgment before download (all tiers,
-- never a feature gate). The studio's per-gallery license text lives on the
-- grant (share_grant.license_text, sanitized, <= 2 KB); a non-empty text
-- turns the acknowledgment gate on for BOTH download paths.
--
-- download_license_ack is AUDIT-FROZEN: append-only, one row per agreement,
-- freezing the exact text and its SHA-256 as the visitor saw it — later
-- edits to license_text never rewrite history. No update/delete path
-- exists in the code; deleting the gallery deletes its rows.
ALTER TABLE share_grant ADD COLUMN license_text TEXT;

CREATE TABLE download_license_ack (
  id TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES share_grant(id) ON DELETE CASCADE,
  license_sha256 TEXT NOT NULL,
  license_text TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX download_license_ack_grant_idx ON download_license_ack(grant_id, created_at);
