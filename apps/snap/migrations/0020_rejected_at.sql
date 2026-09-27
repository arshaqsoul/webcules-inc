-- WEB-118: rejection timestamp anchors the rejected auto-delete retention
-- clock (epoch seconds, matching the RAW vault columns; null = clock not
-- running — set when an asset is rejected, cleared on approve/reset).
ALTER TABLE asset ADD COLUMN rejected_at INTEGER;
