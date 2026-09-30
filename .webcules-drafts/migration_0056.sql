-- Snap 0056 — WEB-277 business identity: legal name, address, tax id,
-- phone, website for invoices/contracts/merge fields. JSON bag (≤ 4 KB);
-- null = studio never set it (PDFs unchanged).
-- Applied with:
--   wrangler d1 execute webcules-snap --local|--remote --file=./migrations/0056_business_identity.sql

ALTER TABLE studio_profile ADD COLUMN business TEXT;
