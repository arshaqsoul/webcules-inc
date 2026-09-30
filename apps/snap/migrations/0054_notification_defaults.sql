-- Snap 0054 — WEB-278 notification settings + delivery defaults.
--  notification_prefs: JSON map of studio-alert toggles (absent = on)
--  client_notify_default: default notify state for freshly created client rows
--  default_expiry_days / default_allow_download: pre-fills for new share grants
-- Applied with:
--   wrangler d1 execute webcules-snap --local|--remote --file=./migrations/0054_notification_defaults.sql

ALTER TABLE studio_profile ADD COLUMN notification_prefs TEXT;
ALTER TABLE studio_profile ADD COLUMN client_notify_default INTEGER NOT NULL DEFAULT 1;
ALTER TABLE studio_profile ADD COLUMN default_expiry_days INTEGER;
ALTER TABLE studio_profile ADD COLUMN default_allow_download INTEGER NOT NULL DEFAULT 1;

-- WEB-275 team roles: per-org "members see RAW vault" toggle (off by default).
ALTER TABLE studio_profile ADD COLUMN member_raw_access INTEGER NOT NULL DEFAULT 0;
