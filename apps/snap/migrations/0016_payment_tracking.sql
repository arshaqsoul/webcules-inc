-- 0016: Project payment tracking (WEB-135) — quoted total per project +
-- manual/offline payment records. Stripe rows keep flowing into the same
-- payment ledger; manual rows carry method + note.
ALTER TABLE project ADD COLUMN quoted_total_minor INTEGER;
ALTER TABLE project ADD COLUMN quoted_currency TEXT NOT NULL DEFAULT 'usd';
ALTER TABLE payment ADD COLUMN method TEXT;
ALTER TABLE payment ADD COLUMN note TEXT;
