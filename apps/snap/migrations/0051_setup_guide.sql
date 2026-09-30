-- WEB-269/270 (setup guide): dismiss/reopen persistence on the studio
-- profile, and a demo marker on project — the setup guide's "send yourself a
-- demo gallery" step creates one; margin rollups exclude its bytes while it
-- still counts toward the studio's storage quota (honest usage, platform
-- cost truth).
ALTER TABLE studio_profile ADD COLUMN setup_dismissed_at INTEGER;
ALTER TABLE studio_profile ADD COLUMN setup_reopened_at INTEGER;
ALTER TABLE project ADD COLUMN demo INTEGER;
