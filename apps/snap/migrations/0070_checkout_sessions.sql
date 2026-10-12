-- WEB-168 (Linear WEB-356, Commerce C2 3/7): Stripe Checkout Sessions minted
-- per cart for gallery stores. One row per session actually created on the
-- studio's CONNECTED account (direct charge — the studio's Stripe takes the
-- payment and the fee; Snap never routes client money and never takes a cut).
--
-- idempotency_key is derived deterministically from the LIVE-repriced cart
-- contents (currency + subtotal + a hash over variant:quantity:price lines),
-- so replaying checkout on an unchanged cart returns the existing pending
-- session instead of minting another one, and the same key rides the Stripe
-- request as its Idempotency-Key header so a retried HTTP call cannot
-- double-create either. Any catalog/price change re-keys → new session.
-- Uniqueness is PARTIAL (pending only): once a session is completed/expired
-- history keeps its row, and the same contents may legitimately mint a fresh
-- pending session (e.g. the previous one aged past Stripe's 24h expiry).
--
-- status: pending → completed | expired. The webhook handlers (C2 4/7) and a
-- later sweep flip it; rows are immutable history once terminal.
-- stripe_account_id is stored per session because refunds (C3 6/8) must run
-- ON the studio's account, not the platform.
CREATE TABLE checkout_session (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  cart_id TEXT NOT NULL REFERENCES cart(id) ON DELETE CASCADE,
  -- Stripe Checkout Session id (cs_...) on the studio's connected account.
  stripe_session_id TEXT NOT NULL,
  -- The connected account the session was created on (acct_...).
  stripe_account_id TEXT NOT NULL,
  -- The hosted checkout URL handed to the buyer's browser.
  url TEXT NOT NULL,
  -- ISO 4217 of the repriced total at session-creation time.
  currency TEXT NOT NULL,
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX checkout_session_pending_key_unique ON checkout_session(idempotency_key) WHERE status = 'pending';
CREATE INDEX checkout_session_cart_idx ON checkout_session(cart_id, status);
CREATE INDEX checkout_session_stripe_idx ON checkout_session(stripe_session_id);
