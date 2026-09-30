-- WEB-273 (booking reminders): exact-once guard — one row per
-- (booking, offset). A repeated sweep (or a retried cron) can never
-- double-send: the INSERT..ON CONFLICT DO NOTHING claim decides the owner.
CREATE TABLE booking_reminders (
  booking_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  offset_hours INTEGER NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (booking_id, offset_hours)
);
CREATE INDEX booking_reminders_org_idx ON booking_reminders(organization_id, sent_at);
