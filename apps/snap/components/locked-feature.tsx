"use client";

/* WEBC-117 — shared locked-feature affordance for the Billing chips, in the
 * contract-templates pattern (components/contract-templates-list.tsx): the
 * locked state names the tier that unlocks instead of a bare strike. State
 * comes from lib/plans-data.ts via lib/feature-chips.ts — never a plan-id
 * check inline. Rendering is unchanged from the pre-refactor chips: muted
 * when included, tertiary line-through when locked (WEB-248 semantics). */
import { capabilityChip, type CapabilityKey } from "@/lib/feature-chips";
import { type PlanId } from "@/lib/plans-data";

export function LockedFeature({ plan, feature, label }: { plan: PlanId; feature: CapabilityKey; label: string }) {
  const chip = capabilityChip(feature, plan, label);
  if (chip.state === "included") {
    return <span className="rounded-full bg-surface-2 px-2.5 py-1 text-ink-muted">{label}</span>;
  }
  return (
    <span
      className="rounded-full bg-surface-2 px-2.5 py-1 text-ink-tertiary line-through"
      title={`Not on your plan — ${chip.unlockPlanName} and up`}
    >
      {label}
    </span>
  );
}
