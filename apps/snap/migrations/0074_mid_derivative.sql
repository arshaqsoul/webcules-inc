-- WEB-196 size ladder: the `mid` derivative (~1280px long edge) — the third
-- rung of the download ladder (Original / 2048 / 1280). Like thumb/preview
-- it is generated browser-side with canvas, but ON DEMAND (first studio
-- "prepare" pass or client download), never at upload time.
ALTER TABLE asset ADD COLUMN mid_key TEXT;
