-- WEB-272: self-serve reschedule/cancel. Manage-booking link tokens reuse the
-- share-grant pattern — only the SHA-256 hash (lookup) + an AES-GCM
-- encryption (re-email) are persisted; plaintext exists only in the email.
ALTER TABLE booking ADD COLUMN manage_token_hash TEXT;
ALTER TABLE booking ADD COLUMN manage_token_enc TEXT;
-- active | revoked (revoked kills the manage link for that booking).
ALTER TABLE booking ADD COLUMN manage_token_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE booking ADD COLUMN manage_revoked_at INTEGER;
-- Reschedule bookkeeping: the booking row updates in place; these record the
-- previous slot for the studio calendar + client emails.
ALTER TABLE booking ADD COLUMN rescheduled_at INTEGER;
ALTER TABLE booking ADD COLUMN previous_start_at INTEGER;
CREATE UNIQUE INDEX booking_manage_token_hash_unique ON booking(manage_token_hash) WHERE manage_token_hash IS NOT NULL;
