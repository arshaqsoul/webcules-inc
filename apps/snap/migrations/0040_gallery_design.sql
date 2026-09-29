-- WEB-258: per-project gallery design (covers, layout, theme) as validated
-- JSON (<= 16 KB, app-level). NULL = classic gallery (or org default preset).
ALTER TABLE project ADD COLUMN gallery_design TEXT;
