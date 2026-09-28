/* PLANS invariants — the tier ladder must stay internally consistent
 * (WEB-215 semantics: free has unlimited bookings + a RAW trial pocket). */
import { describe, expect, it } from "vitest";

import { PLANS, planDef } from "@/lib/plans";

const ORDER = ["free", "lite", "studio", "pro"] as const;

describe("PLANS", () => {
  it("has exactly the four tiers in price order", () => {
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

  it("hard lock and monthly upload bound sit at 2x the included cap (studio rounds up to a whole TB)", () => {
    for (const id of ORDER) {
      const p = PLANS[id];
      // Guardrails: never below 2x, never above 2.1x (studio's lock is
      // TB-rounded: 1TB vs 2x500GB = 1000GB — ~2.5% over, cosmetic slack).
      expect(p.hardLockBytes).toBeGreaterThanOrEqual(p.storageBytes * 2);
      expect(p.hardLockBytes).toBeLessThanOrEqual(p.storageBytes * 2.1);
      expect(p.monthlyUploadBytes).toBeGreaterThanOrEqual(p.storageBytes * 2);
    }
    // Exact-2x tiers (studio's lock is TB-rounded: 1TB vs 2x500GB=1000GB).
    for (const id of ["free", "lite", "pro"] as const) {
      expect(PLANS[id].hardLockBytes).toBe(PLANS[id].storageBytes * 2);
      expect(PLANS[id].monthlyUploadBytes).toBe(PLANS[id].storageBytes * 2);
    }
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
