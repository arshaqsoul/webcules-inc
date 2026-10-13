-- WEB-346 (renumbered from 0079 during merge — master's 0079 is WEB-182 upload_requests) (Feature A, portfolio site rendering): the Free-tier image-view
-- budget counter (WEB-302 §4 — 100k image-views/mo, hard, server-enforced).
-- One row per org per UTC month, incremented on every /api/pubimg serve.
-- Paid tiers carry no hard budget (null cap = soft meter signal only), but
-- the counter still records their usage so the Portfolio hub meter (WEB-347)
-- can render for every plan.
CREATE TABLE portfolio_view_monthly (
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  ym TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, ym)
);
