-- 0017: Invoice generation (WEB-137) — client email + secure-link token
-- columns on invoice (grant-pattern: hash lookup, encrypted token for
-- re-email) and the per-org sequential counter table.
ALTER TABLE invoice ADD COLUMN client_email TEXT;
ALTER TABLE invoice ADD COLUMN access_token_hash TEXT;
ALTER TABLE invoice ADD COLUMN token_enc TEXT;
CREATE TABLE org_counter (
  organization_id TEXT PRIMARY KEY,
  invoice_seq INTEGER NOT NULL DEFAULT 0
);
