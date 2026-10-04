-- Welcome collage: opt-in banner on the client gallery. The image always
-- heads the "your photos are ready" email; showing it as the first thing on
-- the gallery itself is a per-grant choice (unchecked by default).
ALTER TABLE share_grant ADD COLUMN welcome_banner INTEGER NOT NULL DEFAULT 0;
