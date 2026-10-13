-- WEB-344 (Portfolio core, AC3): the rights attestation at publish. The
-- studio must explicitly attest ("I hold the publication rights to every
-- photo in my portfolio collections") the first time the site goes live;
-- who/when is recorded. Unpublishing never clears the record (audit), and a
-- re-publish keeps the prior attestation.
ALTER TABLE portfolio_site ADD COLUMN rights_attested_at INTEGER;
ALTER TABLE portfolio_site ADD COLUMN rights_attested_by TEXT REFERENCES user(id) ON DELETE SET NULL;
