-- 0025: scheduled downgrades. A paid→paid switch to a cheaper tier now
-- applies at the END of the billing cycle: pending_plan holds the target
-- tier while the current one keeps its entitlements; the daily cron (or the
-- renewal webhook) flips it once plan_period_end passes.
ALTER TABLE studio_profile ADD COLUMN pending_plan TEXT;
