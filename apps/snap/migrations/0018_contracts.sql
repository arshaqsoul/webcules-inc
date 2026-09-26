-- 0018: Contracts & e-signatures MVP (WEB-158). Body stores the template
-- until send, then the merged text (frozen at send time). Signing captures
-- typed name + IP + user agent + timestamp; the signed PDF archives to R2.
CREATE TABLE contract (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  /** Merge-field template while draft; merged text once sent. */
  body TEXT NOT NULL,
  /** draft | sent | signed | void */
  status TEXT NOT NULL DEFAULT 'draft',
  client_email TEXT,
  access_token_hash TEXT,
  token_enc TEXT,
  sent_at INTEGER,
  signed_at INTEGER,
  signer_name TEXT,
  signer_ip TEXT,
  signer_user_agent TEXT,
  /** R2 key of the signed PDF (org-prefixed). */
  pdf_key TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX contract_org_project_idx ON contract(organization_id, project_id);
