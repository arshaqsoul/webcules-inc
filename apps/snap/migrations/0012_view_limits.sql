-- 0012: Gallery view rate limiting (WEB-160) — per-IP sliding window +
-- per-gallery monthly budget counters. Counter upserts (not row logs) so the
-- write volume stays one row per window/month, and the monthly table doubles
-- as the per-org usage rollup for margin monitoring (WEB-161).
CREATE TABLE view_rate_window (
  ip TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, window_start)
);
CREATE TABLE gallery_view_monthly (
  organization_id TEXT NOT NULL,
  grant_id TEXT NOT NULL,
  month TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, grant_id, month)
);
CREATE INDEX gallery_view_monthly_org_idx ON gallery_view_monthly(organization_id, month);
