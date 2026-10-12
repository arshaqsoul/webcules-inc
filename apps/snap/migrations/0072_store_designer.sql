-- WEB-277 (Commerce C1 6/7): studio-wide store open/closed switch.
-- Closed hides Buy surfaces at render; it never deletes price lists or
-- unassigns galleries. Default 0 (closed) — the store opens explicitly.
ALTER TABLE studio_profile ADD COLUMN store_open INTEGER NOT NULL DEFAULT 0;
