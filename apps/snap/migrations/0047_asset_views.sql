-- WEB-265 gallery analytics: per-photo interest counters (the heat
-- overlay) — same upsert pattern as gallery_view_monthly. One row per
-- asset+month; the asset route bumps it on admitted (non-range) views.
CREATE TABLE asset_view_monthly (
  organization_id TEXT NOT NULL,
  grant_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  month TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, grant_id, asset_id, month)
);
CREATE INDEX asset_view_monthly_org_idx ON asset_view_monthly(organization_id, month);
