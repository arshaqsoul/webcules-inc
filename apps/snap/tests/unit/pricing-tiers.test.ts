/* TIER_CARDS invariants — the one pricing surface every page renders
 * (landing, onboarding, settings). Marketing must not drift from lib/plans. */
import { describe, expect, it } from "vitest";

import { PLANS } from "@/lib/plans";
import { PRO_CARD, TALK_TO_US_HREF, TEAMS_CTA, TIER_CARDS } from "@/lib/tier-cards";

describe("TIER_CARDS", () => {
  it("WEB-329: the public ladder is Free, Lite, Studio - Pro is never offered self-serve", () => {
    expect(TIER_CARDS.map((t) => t.id)).toEqual(["free", "lite", "studio"]);
    expect(TIER_CARDS.some((t) => (t.id as string) === "pro")).toBe(false);
    expect(TIER_CARDS.some((t) => t.href.includes("plan=pro"))).toBe(false);
    // Pro lives on as a sales-assigned plan: a card for the current-plan view
    // and a Talk to us CTA - never a signup/checkout link.
    expect(PRO_CARD.id).toBe("pro");
    expect(PRO_CARD.href).toBe(TALK_TO_US_HREF);
    expect(TEAMS_CTA.href).toBe(TALK_TO_US_HREF);
    expect(TEAMS_CTA.cta).toBe("Talk to us");
  });

  it("mirrors lib/plans ids, names, and prices exactly", () => {
    for (const card of [...TIER_CARDS, PRO_CARD]) {
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
    // Free: galleries exist (secure + basic slideshow + video) + the seed
    // templates (WEB-317's free-tier wow) + one-click Download all (every plan)
    // — no builder/app/social-sharing claims.
    expect(byTier.free).toMatch(/Secure client galleries/);
    expect(byTier.free).toMatch(/Basic slideshow/);
    expect(byTier.free).toMatch(/5 designer gallery looks/); // WEB-327: Free = 5 cover-only seeds, not 10
    expect(byTier.free).not.toMatch(/page builder|photo app \(\/my\)|ZIP|social sharing/i);
    // Lite: client app + the page builder (WEB-321), music slideshows + sharing, PIN + web-size (Download all itself is free).
    expect(byTier.lite).toMatch(/Client photo app/);
    expect(byTier.lite).toMatch(/Gallery page builder/);
    expect(byTier.lite).toMatch(/custom fonts/);
    expect(byTier.lite).toMatch(/your music/);
    expect(byTier.lite).toMatch(/social sharing/);
    expect(byTier.lite).toMatch(/Download PIN/);
    expect(byTier.lite).not.toMatch(/ZIP/i); // bulk download is no longer a paid perk
    // Studio: collages + unlimited saved looks (WEB-322/323), sneak peeks +
    // approvals, favorites lists/notes/exports, per-photo insights.
    expect(byTier.studio).toMatch(/Collage sections/);
    expect(byTier.studio).toMatch(/unlimited custom gallery looks/);
    expect(byTier.studio).toMatch(/Sneak peeks/);
    expect(byTier.studio).toMatch(/download approvals/);
    expect(byTier.studio).toMatch(/lists, notes/);
    expect(byTier.studio).toMatch(/Per-photo insights/);
    // Pro (current-plan view only): the client app fully theirs (own domain).
    expect(PRO_CARD.features.join(" ")).toMatch(/photo app domain/);
  });

  it("exactly one highlighted tier; every tier has a signup href and CTA", () => {
    expect(TIER_CARDS.filter((t) => t.highlight)).toHaveLength(1);
    for (const t of TIER_CARDS) {
      expect(t.href).toMatch(/^\/signup\?plan=/);
      expect(t.cta.length).toBeGreaterThan(2);
      expect(t.spec.length).toBeGreaterThan(4);
    }
  });

  it("cumulative ladder: paid tiers inherit the one below; features never repeat upward", () => {
    const [free, lite, studio] = TIER_CARDS;
    const pro = PRO_CARD;
    expect(free.inherits).toBeUndefined();
    expect(lite.inherits).toMatch(/^Everything in Free/);
    expect(studio.inherits).toMatch(/^Everything in Lite/);
    expect(pro.inherits).toMatch(/^Everything in Studio/);
    const seen = new Set(free.features);
    for (const t of [lite, studio, pro]) {
      for (const f of t.features) {
        expect(seen.has(f), `"${f}" repeats on ${t.name}`).toBe(false);
        seen.add(f);
      }
    }
  });
});
