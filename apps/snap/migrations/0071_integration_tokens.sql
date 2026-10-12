-- WEB-186 (Integrations 1/6): scoped integration tokens — the thin auth
-- every integration (Lightroom publish plugin, future API clients) uses.
-- Raw tokens are NEVER stored (same rule as share links): only the SHA-256
-- hash (unique, the lookup key) plus a short display prefix for the
-- Settings list. scopes is a JSON array of catalog ids
-- (lib/integrations/tokens.ts). Revocation is soft (revoked_at), so audit
-- history survives and the prefix can't be reused ambiguously.
CREATE TABLE integration_token (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '[]',
  last_used_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX integration_token_org_idx ON integration_token(organization_id, created_at);
