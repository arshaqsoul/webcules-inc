-- 0030: custom-domain add-on cancellation intent (WEB-231). Removing the
-- Stripe subscription item happens at period end (studio keeps the domain
-- through the paid cycle); this flag carries the intent until then.
ALTER TABLE studio_profile ADD COLUMN pending_addon_removal INTEGER NOT NULL DEFAULT 0;
