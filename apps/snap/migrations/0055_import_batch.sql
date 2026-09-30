-- Snap 0055 — WEB-276 clients/leads CSV import: batch bookkeeping for
-- dry-run parity, reports, and 7-day undo (rows carry the batch id; undo
-- deletes only rows the batch created and that nothing has used since).
-- Applied with:
--   wrangler d1 execute webcules-snap --local|--remote --file=./migrations/0055_import_batch.sql

CREATE TABLE IF NOT EXISTS import_batch (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,              -- clients | leads
  created_count INTEGER NOT NULL,
  skipped_count INTEGER NOT NULL,
  updated_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS import_batch_org_idx ON import_batch(organization_id, created_at);

ALTER TABLE client ADD COLUMN import_batch_id TEXT REFERENCES import_batch(id) ON DELETE SET NULL;
ALTER TABLE lead ADD COLUMN import_batch_id TEXT REFERENCES import_batch(id) ON DELETE SET NULL;
