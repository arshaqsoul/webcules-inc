/* Seed-template tier gating, shared by the apply route, the design save
 * route, the preview page and the picker. A template's `tier` is the lowest
 * plan that may apply it (free = cover-only look, lite = sectioned page,
 * studio = collage). Below Studio a seed is adapted without its Studio-only
 * controls (hero slider, column counts), so a pristine application always
 * passes the save route's own Studio checks. */

import type { SeedTemplate } from "./seed-templates";

export type SeedTier = SeedTemplate["tier"];

const RANK: Record<string, number> = { free: 0, lite: 1, studio: 2, pro: 2 };

/** Plan ids not in the ladder rank as free. */
export function planRank(planId: string | null | undefined): number {
  return RANK[planId ?? "free"] ?? 0;
}

export function planMeetsSeedTier(planId: string | null | undefined, tier: SeedTier): boolean {
  return planRank(planId) >= RANK[tier];
}

/** The lowest plan that unlocks applying `tier`, for error + upsell copy. */
export function seedGateError(planId: string | null | undefined, tier: SeedTier): "template_requires_lite" | "template_requires_studio" | null {
  if (planMeetsSeedTier(planId, tier)) return null;
  return tier === "studio" ? "template_requires_studio" : "template_requires_lite";
}

export function hasStudioControls(planId: string | null | undefined): boolean {
  return planRank(planId) >= RANK.studio;
}
