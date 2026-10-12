-- WEB-249: persist the pre-template gallery design on the project row so the
-- template picker's Undo survives a reload (it was client-only state and any
-- remount lost it). NULL = nothing to undo. Same size caps as gallery_design.
ALTER TABLE project ADD COLUMN gallery_design_undo TEXT;
