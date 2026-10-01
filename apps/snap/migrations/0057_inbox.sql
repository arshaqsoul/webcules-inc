-- Snap 0057 — WEB-304 inbox data model (WEB-303): threads, thread messages,
-- per-user inbox items. The inbox is a VIEW over events (Linear model):
-- entities stay in their own tables; inbox_item only ever carries per-user
-- read/snooze/deleted state and never mutates the underlying record.
-- Message bodies live in R2 (html_r2_key / raw_r2_key — D1 rows cap at
-- 2 MB); D1 keeps previews and pointers.

CREATE TABLE thread (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  subject TEXT NOT NULL DEFAULT '',
  client_email TEXT NOT NULL,
  client_id TEXT REFERENCES client(id) ON DELETE SET NULL,
  lead_id TEXT REFERENCES lead(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES project(id) ON DELETE SET NULL,
  -- direction of the newest thread_message — drives the "needs reply" filter
  last_direction TEXT,
  last_activity_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX thread_org_client_idx ON thread(organization_id, client_email, last_activity_at);
CREATE INDEX thread_org_activity_idx ON thread(organization_id, last_activity_at);

CREATE TABLE thread_message (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES thread(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  -- in | out
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  -- RFC 5322 Message-ID — the threading lookup key (UNIQUE: duplicates by
  -- webhook retry collapse here, not into the conversation)
  rfc_message_id TEXT UNIQUE,
  in_reply_to TEXT,
  references_chain TEXT,
  from_addr TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  text_preview TEXT NOT NULL DEFAULT '',
  html_r2_key TEXT,
  raw_r2_key TEXT,
  has_attachments INTEGER NOT NULL DEFAULT 0,
  -- received | sent | failed
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','sent','failed')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX thread_message_thread_idx ON thread_message(thread_id, created_at);

CREATE TABLE inbox_item (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  -- email | booking | contract | invoice | gallery | order | lead
  kind TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  thread_id TEXT REFERENCES thread(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  preview TEXT NOT NULL DEFAULT '',
  read_at INTEGER,
  snoozed_until INTEGER,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX inbox_item_user_stream_idx ON inbox_item(user_id, deleted_at, created_at);
CREATE INDEX inbox_item_user_read_idx ON inbox_item(user_id, read_at);
-- One open item per (user, entity): refires (webhook retries, repeat views)
-- collapse instead of stacking. Deleted items free the slot — a NEW event on
-- the same entity is a new notification and may mint again.
CREATE UNIQUE INDEX inbox_item_user_entity_unique
  ON inbox_item(user_id, entity_type, entity_id) WHERE deleted_at IS NULL;
