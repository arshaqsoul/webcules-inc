-- WEB-352: client payments are DIRECT charges on the studio's own Stripe
-- account. Record which account a payment was taken on so refunds run on the
-- same account (Stripe-Account header). NULL = legacy platform-account payment.
ALTER TABLE payment ADD COLUMN stripe_account_id TEXT;
