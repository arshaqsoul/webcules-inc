-- Downloads 3.0: download-all streams on demand from R2, so the build
-- pipeline's columns (built_at, expires_at) and states (zipping/ready/
-- expired/failed) are gone. Rows that never reached a client are re-opened
-- as 'approved' (the streamed download just works); zip_key stays until the
-- daily sweep has deleted the old archives from R2 (purgeLegacyZips).
UPDATE download_request SET state = 'approved' WHERE state IN ('zipping', 'ready', 'expired', 'failed');
ALTER TABLE download_request DROP COLUMN built_at;
ALTER TABLE download_request DROP COLUMN expires_at;
