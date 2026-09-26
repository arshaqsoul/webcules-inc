-- 0014: Client portal (Epic 10) — per-studio notification opt-out lives on
-- the client row itself (one row per studio per client).
ALTER TABLE client ADD COLUMN notify INTEGER NOT NULL DEFAULT 1;
