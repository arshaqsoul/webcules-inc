-- Snap 0053 — WEB-279 two-factor authentication (TOTP + backup codes).
-- Better Auth twoFactor plugin (1.7.6): a boolean on user + one two_factor
-- row per enabled account (encrypted secret + encrypted backup codes).
-- Applied with:
--   wrangler d1 execute webcules-snap --local|--remote --file=./migrations/0053_two_factor.sql

ALTER TABLE user ADD COLUMN two_factor_enabled INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS two_factor (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  backup_codes TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 1,
  failed_verification_count INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER
);
CREATE INDEX IF NOT EXISTS two_factor_user_id_idx ON two_factor(user_id);
