-- WEB-266 guest access & lifecycle: gallery guests (email-capture gate +
-- pre-registration lists), scheduled grants (open_at), and the
-- updated-photos notification stamp.
CREATE TABLE gallery_guest (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  grant_id TEXT NOT NULL REFERENCES share_grant(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  -- guest | preregistered
  kind TEXT NOT NULL DEFAULT 'guest',
  -- Registered guests that were emailed on open.
  notified_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (grant_id, email)
);
CREATE INDEX gallery_guest_org_idx ON gallery_guest(organization_id, created_at);

ALTER TABLE share_grant ADD COLUMN open_at INTEGER;
ALTER TABLE share_grant ADD COLUMN updated_notify_at INTEGER;
