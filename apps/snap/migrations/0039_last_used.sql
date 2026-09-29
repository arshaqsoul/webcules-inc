-- WEB-255: template hub — last-used telemetry (set on apply/submission).
ALTER TABLE template ADD COLUMN last_used_at INTEGER;
