/* TIER_CARDS invariants — the one pricing surface every page renders
 * (landing, onboarding, settings). Marketing must not drift from lib/plans. */
import { describe, expect, it } from "vitest";

import { PLANS } from "@/lib/plans";
import { TIER_CARDS } from "@/lib/tier-cards";

describe("TIER_CARDS", () => {
  it("mirrors lib/plans ids, names, and prices exactly", () => {
    expect(TIER_CARDS.map((t) => t.id)).toEqual(["free", "lite", "studio", "pro"]);
    for (const card of TIER_CARDS) {
      expect(card.name.toLowerCase()).toBe(PLANS[card.id].name.toLowerCase());
      expect(card.price).toBe(PLANS[card.id].priceMonthlyUsd);
    }
  });

  it("free card tells the truth: RAW trial, unlimited bookings, no stale claims", () => {
    const free = TIER_CARDS[0];
    expect(free.features).toContain("Unlimited bookings");
    expect(free.features.join(" ")).toMatch(/3 GB RAW trial/);
    const allFeatures = TIER_CARDS.map((t) => t.features.join(" ")).join(" ");
    expect(allFeatures).not.toContain("(coming)");
  });

  it("WEB-267: the gallery feature ladder is present and tier-correct on the cards", () => {
    const byTier = Object.fromEntries(TIER_CARDS.map((t) => [t.id, t.features.join(" ")]));
    // Free: galleries exist (secure + basic slideshow + video) — no design/app/ZIP claims.
    expect(byTier.free).toMatch(/Secure client galleries/);
    expect(byTier.free).toMatch(/Basic slideshow/);
    expect(byTier.free).not.toMatch(/designed galleries|photo app|ZIP|social sharing/i);
    // Lite: client app + designed galleries, music slideshows + sharing, PIN/web-size/ZIPs.
    expect(byTier.lite).toMatch(/Client photo app/);
    expect(byTier.lite).toMatch(/designed galleries/);
    expect(byTier.lite).toMatch(/your music/);
    expect(byTier.lite).toMatch(/social sharing/);
    expect(byTier.lite).toMatch(/Download PIN/);
    // Studio: sneak peeks + approvals, favorites lists/notes/exports, per-photo insights.
    expect(byTier.studio).toMatch(/Sneak peeks/);
    expect(byTier.studio).toMatch(/download approvals/);
    expect(byTier.studio).toMatch(/lists, notes/);
    expect(byTier.studio).toMatch(/Per-photo insights/);
    // Pro: the client app fully theirs (own domain).
    expect(byTier.pro).toMatch(/photo app domain/);
  });

  it("exactly one highlighted tier; every tier has a signup href and CTA", () => {
    expect(TIER_CARDS.filter((t) => t.highlight)).toHaveLength(1);
    for (const t of TIER_CARDS) {
      expect(t.href).toMatch(/^\/signup\?plan=/);
      expect(t.cta.length).toBeGreaterThan(2);
      expect(t.spec.length).toBeGreaterThan(4);
    }
  });
});
