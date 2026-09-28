-- 0028: multi-studio (WEB-217) — linked orgs under one subscription.
-- A family is exactly one level deep: children point at a parent org; the
-- parent owns the subscription and quotas POOL across the family. All domain
-- data (projects, leads, embeds, grants, invoices, Connect accounts,
-- dormancy clocks) stays org-scoped — the only new shared computation is
-- entitlement aggregation.
ALTER TABLE organization ADD COLUMN parent_organization_id TEXT REFERENCES organization(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS organization_parent_idx ON organization(parent_organization_id);
