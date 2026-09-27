-- WEB-174: payable invoices — persistent Stripe Payment Link per sent
-- invoice (checkout sessions expire in 24h; links don't).
ALTER TABLE invoice ADD COLUMN payment_url TEXT;
ALTER TABLE invoice ADD COLUMN stripe_payment_link_id TEXT;
