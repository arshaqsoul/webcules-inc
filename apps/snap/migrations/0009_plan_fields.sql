-- 0009: plans & billing (Epic 13) — per-studio plan on studio_profile.
-- Existing studios default to 'studio' (founder decision). Quotas live in
-- lib/plans.ts as code; usage is derived from the asset ledger (no counters
-- to drift). Billing linkage for Snap's own subscriptions (WEB-152).
ALTER TABLE studio_profile ADD COLUMN plan TEXT NOT NULL DEFAULT 'studio';
ALTER TABLE studio_profile ADD COLUMN plan_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE studio_profile ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE studio_profile ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE studio_profile ADD COLUMN plan_period_end INTEGER;
