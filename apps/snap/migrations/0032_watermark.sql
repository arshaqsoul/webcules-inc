-- WEB-242 white-label 5/8: watermark engine.
-- preview_wm: the watermarked preview derivative (browser-composited) —
-- originals and downloads stay clean by design; proofing grants swap the
-- download to this variant (pre-sale delivery).
ALTER TABLE asset ADD COLUMN preview_wm_key TEXT;

-- Per-grant proofing mode: downloads deliver the watermarked preview.
ALTER TABLE share_grant ADD COLUMN proofing INTEGER NOT NULL DEFAULT 0;

-- Per-project watermark override: NULL/'inherit' | 'on' | 'off'.
ALTER TABLE project ADD COLUMN watermark_override TEXT;
