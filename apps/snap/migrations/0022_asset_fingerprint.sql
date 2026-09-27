-- Files polish: content fingerprint (fp1:sha256 of size + first 1MB,
-- client-computed) for duplicate-upload detection within a project.
ALTER TABLE asset ADD COLUMN fingerprint TEXT;
CREATE INDEX IF NOT EXISTS asset_fp_idx ON asset(project_id, fingerprint);
