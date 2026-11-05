/* PLANS invariants — the tier ladder must stay internally consistent
 * (WEB-215 semantics: free has unlimited bookings + a RAW trial pocket). */
import { describe, expect, it } from "vitest";

import { PLANS, planDef } from "@/lib/plans";
import { TIER_CARDS } from "@/lib/tier-cards";

const ORDER = ["free", "lite", "studio", "pro"] as const;

describe("PLANS", () => {
  it("has exactly the four internal plan ids in price order (Pro is sales-assigned, WEB-329)", () => {
    expect(Object.keys(PLANS)).toEqual([...ORDER]);
    const prices = ORDER.map((id) => PLANS[id].priceMonthlyUsd);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it("free: unlimited bookings, 5 galleries, 3 GB RAW pocket inside 20 GB", () => {
    const free = PLANS.free;
    expect(free.priceMonthlyUsd).toBe(0);
    expect(free.maxActiveBookings).toBeNull();
    expect(free.maxActiveGalleries).toBe(5);
    expect(free.rawTrialBytes).toBe(3 * 1024 ** 3);
    expect(free.rawAllowed).toBe(false);
    expect(free.storageBytes).toBe(20 * 1024 ** 3);
  });

  it("paid tiers: unlimited bookings, unlimited RAW, no trial pocket", () => {
    for (const id of ["lite", "studio", "pro"] as const) {
      const p = PLANS[id];
      expect(p.maxActiveBookings).toBeNull();
      expect(p.rawAllowed).toBe(true);
      expect(p.rawTrialBytes).toBeNull();
    }
  });

  it("hard lock and monthly upload bound sit at 2x the included cap — except Lite, which locks AT its cap (WEBC-468: studio rounds up to a whole TB)", () => {
    for (const id of ORDER) {
      const p = PLANS[id];
      // Guardrail floor: the lock never sits below the advertised cap, and
      // the monthly upload bound never sits below the lock.
      expect(p.hardLockBytes).toBeGreaterThanOrEqual(p.storageBytes);
      expect(p.monthlyUploadBytes).toBeGreaterThanOrEqual(p.hardLockBytes);
    }
    // Exact-2x tiers: a warning/overage zone runs cap → 2× lock (studio's
    // lock is TB-rounded: 1TB vs 2x500GB=1000GB).
    for (const id of ["free", "pro"] as const) {
      expect(PLANS[id].hardLockBytes).toBe(PLANS[id].storageBytes * 2);
      expect(PLANS[id].monthlyUploadBytes).toBe(PLANS[id].storageBytes * 2);
    }
    expect(PLANS.studio.hardLockBytes).toBe(1024 ** 4);
    expect(PLANS.studio.monthlyUploadBytes).toBe(1024 ** 4);
  });

  it("WEBC-468: Lite has no overage zone — uploads stop at the advertised 150 GB cap", () => {
    const lite = PLANS.lite;
    expect(lite.hardLockBytes).toBe(lite.storageBytes);
    expect(lite.monthlyUploadBytes).toBe(lite.storageBytes);
    expect(lite.overagePerGbUsd).toBe(0);
    expect(lite.storageBytes).toBe(150 * 1024 ** 3);
  });

  it("white-label only from studio; galleries unlimited from studio", () => {
    expect(PLANS.free.whiteLabel).toBe(false);
    expect(PLANS.lite.whiteLabel).toBe(false);
    expect(PLANS.studio.whiteLabel).toBe(true);
    expect(PLANS.pro.whiteLabel).toBe(true);
    expect(PLANS.studio.maxActiveGalleries).toBeNull();
  });

  it("planDef falls back to free for unknown/null plans", () => {
    expect(planDef("nonsense").id).toBe("free");
    expect(planDef(null).id).toBe("free");
    expect(planDef(undefined).id).toBe("free");
  });
});

/* WEB-309 — the inbox gate table, audited against the single source:
 * everything free-for-all by design (the inbox is the retention surface);
 * snooze is the one gated nicety (Lite+). */
describe("inbox tier gates (WEB-309)", () => {
  it("inbox is free-for-all; snooze Lite+", () => {
    expect(PLANS.free.inboxSnooze).toBe(false);
    expect(PLANS.lite.inboxSnooze).toBe(true);
    expect(PLANS.studio.inboxSnooze).toBe(true);
    expect(PLANS.pro.inboxSnooze).toBe(true);
  });

  it("tier cards carry the inbox on every tier (headline for all)", () => {
    const free = TIER_CARDS.find((t) => t.id === "free")!;
    expect(free.features.some((f) => f.toLowerCase().includes("inbox"))).toBe(true);
    const lite = TIER_CARDS.find((t) => t.id === "lite")!;
    expect(lite.features.some((f) => /snooze/i.test(f))).toBe(true);
    // Marketing truth rule: no tier claims Gmail sync, SMS or AI drafting.
    for (const card of TIER_CARDS) {
      for (const f of card.features) {
        expect(/gmail sync/i.test(f)).toBe(false);
        expect(/\bSMS\b/.test(f)).toBe(false);
        expect(/\bAI\b/.test(f)).toBe(false);
      }
    }
  });
});
