/* White-label decision, single source (WEB-237/238): a client surface is
 * de-branded only when the PLAN grants it (Studio/Pro — lib/plans.ts) AND
 * the studio turned the toggle on (studio_profiles.brand.removeBranding).
 * No surface re-derives this rule — mirrors the plans.ts single-source
 * convention. Client surfaces import isWhiteLabeled; routes that already
 * hold the profile pass its raw brand JSON, everything else uses
 * resolveWhiteLabel (one ent + one profile lookup). */
import { env } from "cloudflare:workers";

import { getPlanEntitlements } from "./plans";
import { getStudioProfile } from "./repos/studios";
import { safeHexColor } from "./embed";

export type WhiteLabelEnt = { whiteLabel: boolean } | null | undefined;

function brandBag(brand: unknown): { removeBranding?: unknown; accent?: unknown } | null {
  let parsed: unknown = brand;
  if (typeof brand === "string") {
    try {
      parsed = JSON.parse(brand || "{}");
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  return parsed as { removeBranding?: unknown; accent?: unknown };
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

/** WEB-240: everything a client email needs to brand itself — one bundle,
 * one profile+entitlement read per send site. emailHeaderUrl is the
 * ABSOLUTE public URL of the 2/8 email-header asset (logo) or null. */
export type EmailBrand = {
  studioName: string;
  accent: string;
  whiteLabel: boolean;
  contactEmail: string | null;
  emailHeaderUrl: string | null;
};

export async function getEmailBrand(organizationId: string): Promise<EmailBrand> {
  const [ent, profile] = await Promise.all([
    getPlanEntitlements(organizationId),
    getStudioProfile(organizationId),
  ]);
  const bag = brandBag(profile?.brand);
  const studioName = profile?.studioName ?? "your photographer";
  const accent = (typeof bag?.accent === "string" ? safeHexColor(bag.accent) : null) ?? "#5e6ad2";
  const whiteLabel = isWhiteLabeled(ent, profile?.brand);
  let emailHeaderUrl: string | null = null;
  if (whiteLabel) {
    const assets = parseEmailAssetBag(profile?.brandAssets);
    if (assets.emailHeader && assets.rev) {
      const origin = env.NEXT_PUBLIC_APP_URL ?? "https://snap.webcules.com";
      emailHeaderUrl = `${origin}/api/brand/${organizationId}/email-header.png?rev=${assets.rev}`;
    }
  }
  return { studioName, accent, whiteLabel, contactEmail: profile?.contactEmail ?? null, emailHeaderUrl };
}

/* Minimal local parse of the 2/8 asset bag (just the two keys we need). */
function parseEmailAssetBag(json: string | null | undefined): { rev?: string; emailHeader?: string } {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json) as { rev?: unknown; emailHeader?: unknown };
    return {
      ...(typeof parsed.rev === "string" ? { rev: parsed.rev } : {}),
      ...(typeof parsed.emailHeader === "string" ? { emailHeader: parsed.emailHeader } : {}),
    };
  } catch {
    return {};
  }
}
