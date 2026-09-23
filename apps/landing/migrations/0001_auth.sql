-- 0001_auth.sql — better-auth 1.7.5 tables + components-playground saved_configs
-- Database: shared D1 `webcules-cms` (binding `D1` in apps/landing/wrangler.jsonc)
--
-- Apply locally:   pnpm --filter landing db:migrate
-- Apply remotely:  cd apps/landing && npx wrangler d1 execute webcules-cms --remote --file=./migrations/0001_auth.sql
--
-- SQLite dialect; integer timestamps are unixepoch seconds (matches the drizzle
-- schema in lib/db-schema.ts with { mode: "timestamp" } columns).

CREATE TABLE IF NOT EXISTS `user` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `name` TEXT NOT NULL,
  `email` TEXT NOT NULL UNIQUE,
  `email_verified` INTEGER NOT NULL DEFAULT 0,
  `image` TEXT,
  `created_at` INTEGER NOT NULL DEFAULT (unixepoch()),
  `updated_at` INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS `session` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `user_id` TEXT NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `token` TEXT NOT NULL UNIQUE,
  `expires_at` INTEGER NOT NULL,
  `ip_address` TEXT,
  `user_agent` TEXT,
  `created_at` INTEGER NOT NULL DEFAULT (unixepoch()),
  `updated_at` INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS `account` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `user_id` TEXT NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `account_id` TEXT NOT NULL,
  `provider_id` TEXT NOT NULL,
  `access_token` TEXT,
  `refresh_token` TEXT,
  `id_token` TEXT,
  `access_token_expires_at` INTEGER,
  `refresh_token_expires_at` INTEGER,
  `scope` TEXT,
  `password` TEXT,
  `created_at` INTEGER NOT NULL DEFAULT (unixepoch()),
  `updated_at` INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS `verification` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `identifier` TEXT NOT NULL,
  `value` TEXT NOT NULL,
  `expires_at` INTEGER NOT NULL,
  `created_at` INTEGER NOT NULL DEFAULT (unixepoch()),
  `updated_at` INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS `saved_configs` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `user_id` TEXT NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `component` TEXT NOT NULL,
  `title` TEXT NOT NULL DEFAULT '',
  `config` TEXT NOT NULL DEFAULT '{}',
  `created_at` INTEGER NOT NULL DEFAULT (unixepoch()),
  `updated_at` INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Lookup indexes (better-auth queries sessions/accounts by user_id and
-- verifications by identifier; the playground lists configs by user_id).
CREATE INDEX IF NOT EXISTS `session_user_id_idx` ON `session` (`user_id`);
CREATE INDEX IF NOT EXISTS `account_user_id_idx` ON `account` (`user_id`);
CREATE INDEX IF NOT EXISTS `verification_identifier_idx` ON `verification` (`identifier`);
CREATE INDEX IF NOT EXISTS `saved_configs_user_id_idx` ON `saved_configs` (`user_id`);
