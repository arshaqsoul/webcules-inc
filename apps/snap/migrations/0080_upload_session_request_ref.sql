-- WEB-374 (fast-follow to WEB-182): stamp the minting upload_request on
-- every guest upload session. The guest confirm route previously scoped
-- sessions by org + project only, so within one project link A's token
-- could confirm a session minted via link B (cross-link session mixing —
-- only per-link counters were skewed). With the stamp, confirm resolves
-- the session strictly by upload_request_id = the token's own request.
-- SET NULL: deleting a link never orphans its already-minted sessions.
ALTER TABLE upload_session ADD COLUMN upload_request_id TEXT REFERENCES upload_request(id) ON DELETE SET NULL;
CREATE INDEX upload_session_request_idx ON upload_session(upload_request_id);
