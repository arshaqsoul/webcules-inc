-- 0006: gallery OTP gate (WEB-132) — per-grant download policy, hashed OTP
-- codes, and a send log that backs all three caps (30/email/30d, 5/email/15m,
-- 5/IP/1h). Timestamps follow the app convention (epoch seconds via drizzle).
ALTER TABLE share_grant ADD COLUMN allow_download INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS share_otp (
  id TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES share_grant(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS share_otp_grant_idx ON share_otp(grant_id, created_at);

CREATE TABLE IF NOT EXISTS share_otp_log (
  id TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES share_grant(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  ip TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS share_otp_log_email_idx ON share_otp_log(email, created_at);
CREATE INDEX IF NOT EXISTS share_otp_log_ip_idx ON share_otp_log(ip, created_at);
