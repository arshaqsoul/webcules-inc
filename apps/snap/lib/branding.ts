/* White-label decision, single source (WEB-237/238): a client surface is
 * de-branded only when the PLAN grants it (Studio/Pro — lib/plans.ts) AND
 * the studio turned the toggle on (studio_profiles.brand.removeBranding).
 * No surface re-derives this rule — mirrors the plans.ts single-source
 * convention. Client surfaces import isWhiteLabeled; routes that already
 * hold the profile pass its raw brand JSON, everything else uses
 * resolveWhiteLabel (one ent + one profile lookup). */
import { getPlanEntitlements } from "./plans";
import { getStudioProfile } from "./repos/studios";

export type WhiteLabelEnt = { whiteLabel: boolean } | null | undefined;

function brandBag(brand: unknown): { removeBranding?: unknown } | null {
  let parsed: unknown = brand;
  if (typeof brand === "string") {
    try {
      parsed = JSON.parse(brand || "{}");
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  return parsed as { removeBranding?: unknown };
}

/** Effective flag: entitlement AND the studio's own toggle must both agree. */
export function isWhiteLabeled(ent: WhiteLabelEnt, brand: unknown): boolean {
  if (!ent?.whiteLabel) return false;
  return brandBag(brand)?.removeBranding === true;
}

/** Convenience for routes that don't already hold the profile/entitlements. */
export async function resolveWhiteLabel(organizationId: string): Promise<boolean> {
  const [ent, profile] = await Promise.all([
    getPlanEntitlements(organizationId),
    getStudioProfile(organizationId),
  ]);
  return isWhiteLabeled(ent, profile?.brand);
}
