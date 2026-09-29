-- WEB-250: session types — the photography event-type definer. Per-type
-- duration/lead/advance, price/deposit, availability scoping, booking
-- questions and gallery defaults.
CREATE TABLE session_type (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  color TEXT,
  icon TEXT,
  slot_minutes INTEGER,
  buffer_minutes INTEGER,
  min_lead_hours INTEGER,
  max_advance_days INTEGER,
  price_minor INTEGER,
  -- null = inherit the org-level payment config; 'off' disables it.
  deposit_kind TEXT,
  deposit_minor INTEGER,
  -- 'inherit' (NULL + own rules) | 'own' (only own rules)
  availability_mode TEXT NOT NULL DEFAULT 'inherit',
  booking_form_template_id TEXT,
  gallery_defaults TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (organization_id, slug)
);

ALTER TABLE availability_rule ADD COLUMN session_type_id TEXT REFERENCES session_type(id) ON DELETE CASCADE;
ALTER TABLE booking ADD COLUMN session_type_id TEXT REFERENCES session_type(id) ON DELETE SET NULL;
ALTER TABLE booking ADD COLUMN answers TEXT;
ALTER TABLE lead ADD COLUMN session_type_id TEXT;
