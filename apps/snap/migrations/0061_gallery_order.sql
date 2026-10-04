-- Photo order (all tiers): each delivered gallery owns its photo order
-- (share_grant_asset.position, gap-spaced for cheap drag and drop) plus the
-- mode it was last ordered by. Assets gain the two facts the new sorts need:
-- EXIF capture time (-1 = scanned, none found) and a color key for the
-- rainbow sort (computed in the browser from the thumbnail).
ALTER TABLE share_grant_asset ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE share_grant ADD COLUMN order_mode TEXT NOT NULL DEFAULT 'upload_old';
ALTER TABLE asset ADD COLUMN captured_at INTEGER;
ALTER TABLE asset ADD COLUMN color_key INTEGER;
CREATE INDEX share_grant_asset_order_idx ON share_grant_asset(grant_id, position);
-- Existing galleries keep exactly the order clients see today (upload time).
UPDATE share_grant_asset SET position = 1024 * (SELECT COUNT(*) FROM share_grant_asset s2 JOIN asset a2 ON a2.id = s2.asset_id JOIN asset a1 ON a1.id = share_grant_asset.asset_id WHERE s2.grant_id = share_grant_asset.grant_id AND (a2.created_at < a1.created_at OR (a2.created_at = a1.created_at AND a2.id <= a1.id)));
