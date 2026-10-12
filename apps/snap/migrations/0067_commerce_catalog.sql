-- Commerce C1 catalog foundation (WEB-180): studio-wide price lists hold
-- products, products hold variants, and a gallery (share_grant) has at most
-- ONE active price list at a time via price_list_gallery.
--
-- money:      always integer minor units + ISO 4217 code on the list; one
--             currency per price list, locked at creation.
-- cost_cents: what the photographer pays a lab (0 for digital goods).
-- price_cents: what the client pays.
-- markup_pct: NOT a column — derived from (cost_cents, price_cents) by
--             @webcules/commerce markupPct() on read, so it can never drift.
-- kind:       digital | print | package | custom (packages/custom are
--             tier-gated; prints land post-MVP).
CREATE TABLE price_list (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  currency TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX price_list_org_idx ON price_list(organization_id, created_at);

CREATE TABLE product (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  price_list_id TEXT NOT NULL REFERENCES price_list(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('digital', 'print', 'package', 'custom')),
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX product_list_idx ON product(price_list_id, position);
CREATE INDEX product_org_idx ON product(organization_id);

CREATE TABLE product_variant (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  price_cents INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX product_variant_product_idx ON product_variant(product_id, position);
CREATE INDEX product_variant_org_idx ON product_variant(organization_id);

-- Gallery assignment. History is kept (detached rows stay for audit); the
-- PARTIAL unique index below is the "one active list per gallery" invariant —
-- a second attach must first detach the current row (lib/commerce.ts does
-- both in one batch).
CREATE TABLE price_list_gallery (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  price_list_id TEXT NOT NULL REFERENCES price_list(id) ON DELETE CASCADE,
  grant_id TEXT NOT NULL REFERENCES share_grant(id) ON DELETE CASCADE,
  attached_at INTEGER NOT NULL DEFAULT (unixepoch()),
  detached_at INTEGER
);
CREATE UNIQUE INDEX price_list_gallery_active_idx ON price_list_gallery(grant_id) WHERE detached_at IS NULL;
CREATE INDEX price_list_gallery_list_idx ON price_list_gallery(price_list_id) WHERE detached_at IS NULL;
