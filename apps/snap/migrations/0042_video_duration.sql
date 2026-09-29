-- WEB-260: video duration (ms) on assets — set at upload from the browser's
-- decoder alongside width/height (all set-if-null, originals never rewritten).
ALTER TABLE asset ADD COLUMN duration_ms INTEGER;
