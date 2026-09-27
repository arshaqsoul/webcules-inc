-- Culling v2 (WEB-209 P0): Lightroom-style ratings on assets.
-- stars: 0-5 (0 = unrated); color: 0 = none, 1 red, 2 yellow, 3 green,
-- 4 blue, 5 purple. Small ints, no extra index — every feed query is
-- already narrowed by the org/project composite index, so per-project
-- scans stay cheap; revisit an index only for 10k+/project sets.
ALTER TABLE asset ADD COLUMN stars INTEGER NOT NULL DEFAULT 0;
ALTER TABLE asset ADD COLUMN color INTEGER NOT NULL DEFAULT 0;
