-- WEB-346 (renumbered 0079→0080→0081 during merges — master took 0079=WEB-182 upload_requests, 0080=WEB-374 upload_session_request_ref): the Free-tier image-view
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
