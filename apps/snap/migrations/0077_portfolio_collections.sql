-- WEB-305 (Portfolio core): curated public collections — the one shared
-- primitive the three GO features render (A: portfolio site, B: public API,
-- C: embeddable galleries). Data model per Stark's WEB-301 §3.1; tier caps
-- per the CFO ruling WEB-302 §4 (Free 1 collection / 20 items, Lite 5 / 250,
-- Studio+ unlimited — enforced server-side in lib/repos/portfolio.ts).
--
-- Doctrine (WEB-216): a collection item POINTS at an existing asset; R2
-- bytes and storage_key are never copied or moved. Public-ness is explicit —
-- only assets deliberately placed in a collection are publicly servable.
-- portfolio_api_key (feature B) is deliberately NOT in this migration: the
-- CFO sequencing is core → A → C → B, keys land with B.

CREATE TABLE portfolio_site (
  organization_id TEXT PRIMARY KEY REFERENCES organization(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft',
  theme TEXT NOT NULL DEFAULT '{}',
  home TEXT NOT NULL DEFAULT '{}',
  seo TEXT NOT NULL DEFAULT '{}',
  published_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE portfolio_collection (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  cover_asset_id TEXT REFERENCES asset(id) ON DELETE SET NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'public',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(organization_id, slug)
);
CREATE INDEX portfolio_collection_org_idx ON portfolio_collection(organization_id, sort);

CREATE TABLE portfolio_collection_asset (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES portfolio_collection(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  sort INTEGER NOT NULL DEFAULT 0,
  caption TEXT,
  alt_text TEXT,
  display_crop TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(collection_id, asset_id)
);
CREATE INDEX portfolio_collection_asset_coll_idx ON portfolio_collection_asset(collection_id, sort);
CREATE INDEX portfolio_collection_asset_asset_idx ON portfolio_collection_asset(asset_id);
