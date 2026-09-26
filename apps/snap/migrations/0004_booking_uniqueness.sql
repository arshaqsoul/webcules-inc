-- Snap 0004 — double-book protection: one ACTIVE booking per org per start time.
-- (Partial unique index; canceled bookings free their slot automatically.)
--   wrangler d1 execute webcules-snap --local|--remote --file=./migrations/0004_booking_uniqueness.sql

CREATE UNIQUE INDEX IF NOT EXISTS booking_org_start_active
  ON booking(organization_id, start_at)
  WHERE status != 'canceled';
