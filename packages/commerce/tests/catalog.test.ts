import { describe, expect, it } from "vitest";

import { canCreatePriceList, productKindAllowed, validateCurrency, validateName, validateVariantPrices, type PlanCommerceGates } from "../src/catalog";

const free: PlanCommerceGates = { storeEnabled: false, maxPriceLists: 0, packagesAllowed: false, customProductsAllowed: false };
const lite: PlanCommerceGates = { storeEnabled: true, maxPriceLists: 1, packagesAllowed: false, customProductsAllowed: false };
const studio: PlanCommerceGates = { storeEnabled: true, maxPriceLists: 10, packagesAllowed: true, customProductsAllowed: true };

describe("catalog validation", () => {
  it("trims and caps names", () => {
    expect(validateName("  Wedding prints  ")).toEqual({ ok: true, value: "Wedding prints" });
    expect(validateName("   ")).toEqual({ ok: false, error: "invalid_name" });
    const long = validateName("x".repeat(200));
    expect(long.ok && long.value.length).toBe(80);
  });

  it("validates currency", () => {
    expect(validateCurrency("usd")).toEqual({ ok: true, value: "USD" });
    expect(validateCurrency("us")).toEqual({ ok: false, error: "invalid_currency" });
  });

  it("derives markup for variants", () => {
    expect(validateVariantPrices(1000, 2500)).toEqual({ ok: true, value: { costCents: 1000, priceCents: 2500, markupPct: 150 } });
    expect(validateVariantPrices(0, 900)).toEqual({ ok: true, value: { costCents: 0, priceCents: 900, markupPct: null } });
    expect(validateVariantPrices(1.5, 900)).toEqual({ ok: false, error: "invalid_amount" });
  });
});

describe("plan gates", () => {
  it("blocks every kind when the store is off", () => {
    for (const kind of ["digital", "print", "package", "custom"] as const) {
      expect(productKindAllowed(free, kind)).toEqual({ ok: false, error: "store_disabled" });
    }
  });

  it("gives Lite digital and print only", () => {
    expect(productKindAllowed(lite, "digital").ok).toBe(true);
    expect(productKindAllowed(lite, "print").ok).toBe(true);
    expect(productKindAllowed(lite, "package")).toEqual({ ok: false, error: "kind_not_allowed" });
    expect(productKindAllowed(lite, "custom")).toEqual({ ok: false, error: "kind_not_allowed" });
  });

  it("gives Studio everything and rejects unknown kinds", () => {
    expect(productKindAllowed(studio, "package").ok).toBe(true);
    expect(productKindAllowed(studio, "custom").ok).toBe(true);
    expect(productKindAllowed(studio, "nope" as never)).toEqual({ ok: false, error: "invalid_kind" });
  });

  it("enforces the price list limit, with -1 as unlimited", () => {
    expect(canCreatePriceList(free, 0)).toEqual({ ok: false, error: "store_disabled" });
    expect(canCreatePriceList(lite, 0).ok).toBe(true);
    expect(canCreatePriceList(lite, 1)).toEqual({ ok: false, error: "list_limit_reached" });
    expect(canCreatePriceList({ ...studio, maxPriceLists: -1 }, 500).ok).toBe(true);
  });
});
