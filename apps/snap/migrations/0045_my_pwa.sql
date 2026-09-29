-- WEB-263 client PWA home: email OTP sessions for /my (one code, 30-day
-- remembered device) + the per-asset sneak-peek flag (Studio gate; a first
-- look before the gallery opens).
CREATE TABLE my_otp (
  id TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX my_otp_email_idx ON my_otp(email_hash, created_at);

ALTER TABLE asset ADD COLUMN is_sneak_peek INTEGER NOT NULL DEFAULT 0;
