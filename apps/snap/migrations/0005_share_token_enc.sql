-- 0005: encrypted share token column (re-email the same link without
-- regenerating; lookup still goes through token_hash only)
ALTER TABLE share_grant ADD COLUMN token_enc TEXT;
