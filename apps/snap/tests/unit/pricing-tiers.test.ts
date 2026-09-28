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

  it("exactly one highlighted tier; every tier has a signup href and CTA", () => {
    expect(TIER_CARDS.filter((t) => t.highlight)).toHaveLength(1);
    for (const t of TIER_CARDS) {
      expect(t.href).toMatch(/^\/signup\?plan=/);
      expect(t.cta.length).toBeGreaterThan(2);
      expect(t.spec.length).toBeGreaterThan(4);
    }
  });
});
