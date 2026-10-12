-- WEB-170 (Linear WEB-354, Commerce C2 1/7): server-side carts for gallery
-- stores. Guest carts are keyed to the gallery share grant plus an anonymous
-- visitor cookie; one OPEN cart per (grant, visitor), enforced by a partial
-- unique index. cart_item holds an add-time price snapshot (name + unit price
-- + currency) so a cart still renders after catalog edits — "no longer
-- available" is a drawer state, not a row deletion — and checkout (C2 3/7)
-- re-prices live from the catalog before creating the Stripe session.
-- variant_id is deliberately NOT a foreign key to product_variant (C1 1/7):
-- items outlive catalog changes, and the two migrations stay order-independent.
CREATE TABLE cart (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  -- The GALLERY grant (share_grant): per-photo share children (WEB-262) are
  -- resolved to their parent grant before keying, so one gallery = one cart scope.
  grant_id TEXT NOT NULL REFERENCES share_grant(id) ON DELETE CASCADE,
  -- Opaque anonymous-cookie id (set by the gallery route). Never an account id.
  visitor_id TEXT NOT NULL,
  -- ISO 4217, locked from the price list when the first item is added.
  currency TEXT NOT NULL,
  -- Monotonic state machine (lib/repos/carts.ts): open -> merged | cancelled |
  -- expired | converted. Terminal states never re-open or re-transition.
  status TEXT NOT NULL DEFAULT 'open',
  -- Set by the drawer's coupon field (C2 2/7); validated at checkout (C2 3/7).
  coupon_code TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX cart_open_unique ON cart(grant_id, visitor_id) WHERE status = 'open';
CREATE INDEX cart_org_updated_idx ON cart(organization_id, status, updated_at);
CREATE INDEX cart_grant_updated_idx ON cart(grant_id, status, updated_at);

CREATE TABLE cart_item (
  id TEXT PRIMARY KEY,
  cart_id TEXT NOT NULL REFERENCES cart(id) ON DELETE CASCADE,
  -- Soft reference to product_variant (C1 1/7): see note above.
  variant_id TEXT NOT NULL,
  -- Snapshot at add time; the current catalog price wins at checkout.
  name TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (cart_id, variant_id)
);
CREATE INDEX cart_item_cart_idx ON cart_item(cart_id);
