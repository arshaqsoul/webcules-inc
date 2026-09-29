-- WEB-239 white-label 2/8: brand asset pipeline.
-- One logo upload becomes favicon + apple-touch + email header + OG card +
-- watermark source (generated in the browser, stored here). JSON bag of R2
-- keys plus a revision stamp that cache-busts the public serving URLs:
-- { "rev": "ts", "favicon": "{orgId}/branding/assets/favicon-32-<rev>.png", ... }
ALTER TABLE studio_profile ADD COLUMN brand_assets TEXT;
