-- WEB-284: system-wide key/value state for rate-limit gates on the
-- daily-status cron and raw-vault restore endpoints (value = epoch seconds).
CREATE TABLE system_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
