-- WEB-252: invoice designer — studio invoice settings + per-invoice
-- snapshots (format frozen at creation; old invoices unchanged).
ALTER TABLE studio_profile ADD COLUMN invoice_settings TEXT;
ALTER TABLE invoice ADD COLUMN tax_label TEXT;
ALTER TABLE invoice ADD COLUMN tax_rate_bps INTEGER;
ALTER TABLE invoice ADD COLUMN terms TEXT;
ALTER TABLE invoice ADD COLUMN memo TEXT;
ALTER TABLE org_counter ADD COLUMN invoice_year TEXT;
ALTER TABLE org_counter ADD COLUMN invoice_year_seq INTEGER NOT NULL DEFAULT 0;
