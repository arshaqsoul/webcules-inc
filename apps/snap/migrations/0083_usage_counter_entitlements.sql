-- 0083: WEB-445 — entitlements served from usage_counters. The monthly
-- snapshot rollup (0013 / lib/margin.ts) keeps its columns (stored_bytes on
-- 'YYYY-MM' rows); this migration adds the entitlement columns and the
-- triggers that keep them exact, so lib/plans.ts reads O(#orgs) point
-- lookups instead of SUM/COUNT scans over the org family's whole asset
-- table on every layout render (the WEB-437 time bomb).
--
-- Layout of the data:
--   month = 'total'        → lifetime: stored_bytes, file_count, raw_bytes
--   month = 'YYYY-MM'      → deltas: upload_bytes + upload_ops (monthly
--                            upload budget); snapshot columns from WEB-161
--                            (stored_bytes/image_views/emails_sent) are
--                            owned by the cron rollup and never touched here.
ALTER TABLE usage_counters ADD COLUMN file_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_counters ADD COLUMN raw_bytes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_counters ADD COLUMN upload_bytes INTEGER NOT NULL DEFAULT 0;

-- One-time backfill from the live SUM (the parity source of truth at apply
-- time). `WHERE true` disambiguates the upsert over INSERT..SELECT (same
-- trick as lib/margin.ts). Monthly rows only set the new columns so the
-- cron's snapshot values survive.
INSERT INTO usage_counters (organization_id, month, stored_bytes, file_count, raw_bytes, updated_at)
SELECT organization_id, 'total', COALESCE(SUM(bytes), 0), COUNT(*),
       COALESCE(SUM(CASE WHEN kind = 'raw' THEN bytes ELSE 0 END), 0), unixepoch()
FROM asset WHERE true
GROUP BY organization_id
ON CONFLICT (organization_id, month) DO UPDATE SET
  stored_bytes = excluded.stored_bytes,
  file_count = excluded.file_count,
  raw_bytes = excluded.raw_bytes,
  updated_at = unixepoch();

INSERT INTO usage_counters (organization_id, month, upload_bytes, upload_ops, updated_at)
SELECT organization_id, strftime('%Y-%m', created_at, 'unixepoch'),
       COALESCE(SUM(bytes), 0), COUNT(*), unixepoch()
FROM asset WHERE true
GROUP BY organization_id, strftime('%Y-%m', created_at, 'unixepoch')
ON CONFLICT (organization_id, month) DO UPDATE SET
  upload_bytes = excluded.upload_bytes,
  upload_ops = excluded.upload_ops,
  updated_at = unixepoch();

-- Incremental maintenance: every asset write path (upload confirm,
-- createAsset, bulk delete, retention sweeps, project/org FK cascades, demo
-- seeding) goes through the table, so the counters cannot drift from the
-- ledger. The nightly cron re-derives both aggregates as a safety net
-- (lib/repos/usage-counters.ts).
CREATE TRIGGER usage_counter_asset_insert AFTER INSERT ON asset BEGIN
  INSERT INTO usage_counters (organization_id, month, stored_bytes, file_count, raw_bytes, updated_at)
  VALUES (NEW.organization_id, 'total', NEW.bytes, 1,
          CASE WHEN NEW.kind = 'raw' THEN NEW.bytes ELSE 0 END, unixepoch())
  ON CONFLICT (organization_id, month) DO UPDATE SET
    stored_bytes = stored_bytes + NEW.bytes,
    file_count = file_count + 1,
    raw_bytes = raw_bytes + CASE WHEN NEW.kind = 'raw' THEN NEW.bytes ELSE 0 END,
    updated_at = unixepoch();
  INSERT INTO usage_counters (organization_id, month, upload_bytes, upload_ops, updated_at)
  VALUES (NEW.organization_id, strftime('%Y-%m', 'now'), NEW.bytes, 1, unixepoch())
  ON CONFLICT (organization_id, month) DO UPDATE SET
    upload_bytes = upload_bytes + NEW.bytes,
    upload_ops = upload_ops + 1,
    updated_at = unixepoch();
END;

CREATE TRIGGER usage_counter_asset_delete AFTER DELETE ON asset BEGIN
  INSERT INTO usage_counters (organization_id, month, stored_bytes, file_count, raw_bytes, updated_at)
  VALUES (OLD.organization_id, 'total', -OLD.bytes, -1,
          CASE WHEN OLD.kind = 'raw' THEN -OLD.bytes ELSE 0 END, unixepoch())
  ON CONFLICT (organization_id, month) DO UPDATE SET
    stored_bytes = stored_bytes - OLD.bytes,
    file_count = file_count - 1,
    raw_bytes = raw_bytes - CASE WHEN OLD.kind = 'raw' THEN OLD.bytes ELSE 0 END,
    updated_at = unixepoch();
  -- Monthly upload budget follows the ledger (old live-read semantics: bytes
  -- of assets CREATED this month), so the decrement lands in the asset's own
  -- creation month, not the calendar month of the delete.
  INSERT INTO usage_counters (organization_id, month, upload_bytes, upload_ops, updated_at)
  VALUES (OLD.organization_id, strftime('%Y-%m', OLD.created_at, 'unixepoch'), -OLD.bytes, -1, unixepoch())
  ON CONFLICT (organization_id, month) DO UPDATE SET
    upload_bytes = upload_bytes - OLD.bytes,
    upload_ops = upload_ops - 1,
    updated_at = unixepoch();
END;
