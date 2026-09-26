-- 0007: Stripe Connect (Epic 14) — studio connected-account identity + state.
-- Snap stores only the account id and derived state; KYC/bank data lives in Stripe.
ALTER TABLE studio_profile ADD COLUMN stripe_account_id TEXT;
ALTER TABLE studio_profile ADD COLUMN stripe_connect_state TEXT NOT NULL DEFAULT 'not_connected';
