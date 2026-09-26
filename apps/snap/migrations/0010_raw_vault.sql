-- 0010: RAW Vault (WEB-153) — cold-storage lifecycle on raw assets.
-- All timestamps epoch SECONDS, nullable = stage not reached. RAWs stay hot
-- 6 months (renewal notice at 5), move to R2 Infrequent Access, purge only
-- after 90 archived days + two emailed warnings.
ALTER TABLE asset ADD COLUMN raw_archived_at INTEGER;
ALTER TABLE asset ADD COLUMN raw_keep_until INTEGER;
ALTER TABLE asset ADD COLUMN raw_notice_at INTEGER;
ALTER TABLE asset ADD COLUMN raw_purge_warn1_at INTEGER;
ALTER TABLE asset ADD COLUMN raw_purge_warn2_at INTEGER;

CREATE INDEX asset_raw_scan_idx ON asset(kind, created_at);
CREATE INDEX asset_raw_archive_idx ON asset(raw_archived_at);
