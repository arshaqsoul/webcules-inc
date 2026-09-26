-- Snap 0003 — studio branding logo key (R2 object key, org-prefixed).
--   wrangler d1 execute webcules-snap --local|--remote --file=./migrations/0003_studio_logo.sql

ALTER TABLE studio_profile ADD COLUMN logo_key TEXT;
