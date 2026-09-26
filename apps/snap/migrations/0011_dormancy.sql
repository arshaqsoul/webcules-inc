-- 0011: Dormancy & retention policy (WEB-159) — last-login tracking on
-- studio_profile + the dormant lifecycle stamps the daily sweep owns.
-- Backfill last_active_at = now so no existing studio is instantly dormant.
ALTER TABLE studio_profile ADD COLUMN last_active_at INTEGER;
ALTER TABLE studio_profile ADD COLUMN dormant_notice1_at INTEGER;
ALTER TABLE studio_profile ADD COLUMN dormant_notice2_at INTEGER;
ALTER TABLE studio_profile ADD COLUMN dormant_ia_at INTEGER;
ALTER TABLE studio_profile ADD COLUMN ia_restore_requested_at INTEGER;
ALTER TABLE studio_profile ADD COLUMN dormant_purge_deadline INTEGER;
ALTER TABLE studio_profile ADD COLUMN dormant_purge_state TEXT;
-- Remaining objects in the active bulk storage-class batch (IA move or
-- restore), decremented by the daily sweep until zero.
ALTER TABLE studio_profile ADD COLUMN bulk_class_ops_remaining INTEGER;
-- Last object key processed by the active bulk batch (listing startAfter).
ALTER TABLE studio_profile ADD COLUMN bulk_class_cursor TEXT;
UPDATE studio_profile SET last_active_at = unixepoch();
