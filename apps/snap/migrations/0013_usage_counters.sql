-- 0013: Platform usage & margin monitoring (WEB-161) — one snapshot row per
-- org per month, refreshed daily by the cron (month-to-date values freeze at
-- month end when the key rolls over). COGS is computed at read time against
-- lib/unit-costs.ts so history stays comparable across cost revisions.
CREATE TABLE usage_counters (
  organization_id TEXT NOT NULL,
  month TEXT NOT NULL,
  stored_bytes INTEGER NOT NULL DEFAULT 0,
  image_views INTEGER NOT NULL DEFAULT 0,
  emails_sent INTEGER NOT NULL DEFAULT 0,
  upload_ops INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (organization_id, month)
);
CREATE INDEX usage_counters_month_idx ON usage_counters(month);
