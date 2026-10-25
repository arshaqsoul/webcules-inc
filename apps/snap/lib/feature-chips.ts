/* WEBC-117 — pure derivation of the Billing feature-chip states from the
 * PlanDef table. The chips in components/plan-panel.tsx used to hard-code
 * their plan checks (`st.plan === "studio" || st.plan === "pro" …`), which
 * is how the "Custom form fields" chip drifted from the server gate (the
 * API allows a capped number on Free/Lite; the chip struck the feature
 * through). Every chip state now comes from lib/plans-data.ts — this module
 * is pure so tests/unit/plan-chips.test.ts can pin it against the shipped
 * server gates and fail the suite if the two ever drift. No gate behaviour
 * lives here; the server routes stay the only enforcement. */
import { PLANS, planDef, type PlanDef, type PlanId } from "@/lib/plans-data";

/** The capability chips (WEB-248 glyphs apply): locked chips strike
 * through and name the tier that unlocks them, like the contract-templates
 * "Limit reached — upgrade to Studio" affordance. */
export type CapabilityKey =
  | "bookingPageDesigner"
  | "customGalleryDesigns"
  | "slideshowMusic"
  | "downloadPin"
  | "sneakPeeks"
  | "perPhotoInsights";

/** Upgrade ladder, cheapest first. */
export const PLAN_LADDER: readonly PlanId[] = ["free", "lite", "studio", "pro"];

export function capabilityUnlocked(key: CapabilityKey, plan: PlanId): boolean {
  return Boolean(planDef(plan)[key]);
}

/** Cheapest tier whose PlanDef carries the capability. */
export function capabilityUnlockPlan(key: CapabilityKey): PlanId {
  const first = PLAN_LADDER.find((id) => Boolean(PLANS[id][key] as boolean));
  if (!first) throw new Error(`capability ${key} is not enabled on any plan — check lib/plans-data.ts`);
  return first;
}

/** One billing chip, fully resolved from the PlanDef table:
 * - "included": plain muted chip (label verbatim);
 * - "capped": quantified headroom chip, `up to N` (like session types);
 * - "locked": struck-through chip naming the tier that unlocks. */
export type CapabilityChip =
  | { state: "included"; label: string }
  | { state: "locked"; label: string; unlockPlan: PlanId; unlockPlanName: string };

export function capabilityChip(key: CapabilityKey, plan: PlanId, label: string): CapabilityChip {
  if (capabilityUnlocked(key, plan)) return { state: "included", label };
  const unlockPlan = capabilityUnlockPlan(key);
  return { state: "locked", label, unlockPlan, unlockPlanName: planDef(unlockPlan).name };
}

/** The corrected "Custom form fields" chip: capped on Free/Lite (the API
 * allows up to maxCustomFields), unlimited Studio+. State = the PlanDef
 * field, never a plan-id check. */
export function customFieldsChip(plan: PlanId): { state: "capped"; label: string } | { state: "included"; label: string } {
  const max = planDef(plan).maxCustomFields;
  return max === null
    ? { state: "included", label: "Unlimited custom form fields" }
    : { state: "capped", label: `Custom form fields · up to ${max}` };
}

/** Convenience for tests/docs: the whole chip table for one plan. */
export function capabilityChipsFor(plan: PlanId): Record<CapabilityKey, CapabilityChip> {
  const def = planDef(plan) as PlanDef;
  const labels: Record<CapabilityKey, string> = {
    bookingPageDesigner: "Booking page designer",
    customGalleryDesigns: "Designed galleries + client app",
    slideshowMusic: "Slideshows w/ music + sharing",
    downloadPin: "Download PIN + web size",
    sneakPeeks: "Sneak peeks + approvals",
    perPhotoInsights: "Per-photo insights",
  };
  return Object.fromEntries(
    (Object.keys(labels) as CapabilityKey[]).map((key) => [key, capabilityChip(key, plan, labels[key])]),
  ) as Record<CapabilityKey, CapabilityChip>;
}
