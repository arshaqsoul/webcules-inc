-- Snap 0058 — WEB-307 inbox email plumbing.
--  thread.thread_index:  base64 Thread-Index header we EMIT for a
--    conversation (22 bytes: 6-byte clock + 16-byte stable GUID); inbound
--    Outlook replies match on the GUID bytes 6..21 (Outlook drops References).
--  thread.address_token: short token making the per-thread reply address
--    t-{threadId}-{token}@snap.webcules.com unguessable; a reply to it
--    self-identifies its thread even with every header stripped.
--  studio_profile.inbox_mirror: dual-delivery toggle (default ON) — inbound
--    client replies mirror to the photographer's contact inbox while the
--    Snap inbox is young.
ALTER TABLE thread ADD COLUMN thread_index TEXT;
ALTER TABLE thread ADD COLUMN address_token TEXT;
ALTER TABLE studio_profile ADD COLUMN inbox_mirror INTEGER NOT NULL DEFAULT 1;
