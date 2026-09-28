-- 0026: when the plan last changed (epoch seconds). Powers same-cycle
-- upgrade reversals (industry pattern: default next-cycle downgrade, with
-- an explicit "switch back now" prorated-credit option when the current
-- tier was adopted mid-cycle).
ALTER TABLE studio_profile ADD COLUMN plan_changed_at INTEGER;
