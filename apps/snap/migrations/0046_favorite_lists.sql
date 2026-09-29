-- WEB-263→264 favorites & proofing 2.0: multiple favorite lists per grant +
-- per-photo notes. gallery_favorite's PK (grant, asset) can't hold the same
-- photo in two lists, so the table is rebuilt with (grant, asset, list);
-- existing favorites backfill into a per-grant default "Favorites" list.
-- gallery_selection gains a `seen` flag for the studio's completion flow.
CREATE TABLE favorite_list (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  grant_id TEXT NOT NULL REFERENCES share_grant(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX favorite_list_grant_idx ON favorite_list(grant_id);

CREATE TABLE gallery_favorite_v2 (
  grant_id TEXT NOT NULL REFERENCES share_grant(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  list_id TEXT NOT NULL REFERENCES favorite_list(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  note TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (grant_id, asset_id, list_id)
);

-- Backfill: one default list per grant that has favorites, then attach.
INSERT INTO favorite_list (id, organization_id, grant_id, name)
SELECT lower(hex(randomblob(16))), organization_id, grant_id, 'Favorites'
FROM gallery_favorite GROUP BY grant_id;

INSERT INTO gallery_favorite_v2 (grant_id, asset_id, list_id, organization_id, created_at)
SELECT f.grant_id, f.asset_id, l.id, f.organization_id, f.created_at
FROM gallery_favorite f
JOIN favorite_list l ON l.grant_id = f.grant_id;

DROP TABLE gallery_favorite;
ALTER TABLE gallery_favorite_v2 RENAME TO gallery_favorite;

ALTER TABLE gallery_selection ADD COLUMN seen INTEGER NOT NULL DEFAULT 0;
