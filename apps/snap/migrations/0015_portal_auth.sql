-- 0015: Client portal magic-code login (WEB-131). Same shape as the gallery
-- OTP machinery but email-scoped: latest unexpired code wins, 5 attempts,
-- delivered-email caps enforced from the log.
CREATE TABLE portal_otp (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX portal_otp_email_idx ON portal_otp(email, created_at);

CREATE TABLE portal_otp_log (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  ip TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX portal_otp_log_email_idx ON portal_otp_log(email, created_at);
CREATE INDEX portal_otp_log_ip_idx ON portal_otp_log(ip, created_at);
