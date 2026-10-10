-- Cull assist + non-destructive editing (WEB-401/402)
-- phash:    64-bit dHash (16 hex) computed by the browser at upload —
--           near-duplicate/burst clustering source (clusterSimilar).
-- analysis: quality scores JSON (sharp/lum/clipDark/clipBright/p05/p95)
--           from the same decode pass — cull flags + auto-enhance input.
-- edits:    sparse Lightroom-style adjustment set (lib/edits.ts EditSet).
-- edit_key: R2 key of the browser-rendered edit.jpg derivative (the edited
--           look every serving path prefers when edits exist).
-- group_cover: asset id of the near-duplicate cluster's picked frame
--           (sharpest); NULL = singleton. All members incl. the cover carry
--           the cover id, so member count is one GROUP BY.
ALTER TABLE asset ADD COLUMN phash TEXT;
ALTER TABLE asset ADD COLUMN analysis TEXT;
ALTER TABLE asset ADD COLUMN edits TEXT;
ALTER TABLE asset ADD COLUMN edit_key TEXT;
ALTER TABLE asset ADD COLUMN group_cover TEXT;
CREATE INDEX asset_phash_idx ON asset (project_id, phash);
CREATE INDEX asset_group_cover_idx ON asset (project_id, group_cover);
