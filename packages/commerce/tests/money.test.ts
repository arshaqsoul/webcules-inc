import { describe, expect, it } from "vitest";

import { MoneyError, isMarkupRounding, markupPct, normalizeCurrency, priceFromMarkup, priceFromMarkupRounded, roundPricePreset } from "../src/money";

describe("money", () => {
  it("applies markup and rounds half up", () => {
    expect(priceFromMarkup(1000, 100)).toBe(2000);
    expect(priceFromMarkup(333, 50)).toBe(500);
    expect(priceFromMarkup(1, 50)).toBe(2);
    expect(priceFromMarkup(0, 300)).toBe(0);
  });

  it("derives markup from cost and price", () => {
    expect(markupPct(1000, 2500)).toBe(150);
    expect(markupPct(300, 500)).toBe(66.67);
    expect(markupPct(0, 500)).toBeNull();
  });

  it("rejects fractional, negative and unsafe amounts", () => {
    expect(() => priceFromMarkup(10.5, 10)).toThrow(MoneyError);
    expect(() => priceFromMarkup(-1, 10)).toThrow(MoneyError);
    expect(() => priceFromMarkup(100, -5)).toThrow(MoneyError);
    expect(() => markupPct(100, Number.MAX_SAFE_INTEGER + 1)).toThrow(MoneyError);
  });

  it("normalizes currency codes", () => {
    expect(normalizeCurrency(" cad ")).toBe("CAD");
    expect(() => normalizeCurrency("dollars")).toThrow(MoneyError);
  });
});

/* WEB-179 (Commerce C1 2/7) — bulk-markup rounding presets. */
describe("markup rounding presets", () => {
  it("none keeps the exact computed price", () => {
    expect(priceFromMarkupRounded(1000, 48.7, "none")).toBe(1487);
    expect(roundPricePreset(1487, "none")).toBe(1487);
  });

  it("dollar rounds to the nearest whole unit", () => {
    expect(priceFromMarkupRounded(1000, 48.7, "dollar")).toBe(1500); // 1487 → 1500
    expect(priceFromMarkupRounded(1000, 42, "dollar")).toBe(1400); // 1420 → 1400
  });

  it("charm presets land on .99 / .95 just under the nearest unit", () => {
    expect(priceFromMarkupRounded(1000, 48.7, "charm99")).toBe(1499); // 1487 → 14.99
    expect(priceFromMarkupRounded(1000, 48.7, "charm95")).toBe(1495); // 1487 → 14.95
    expect(priceFromMarkupRounded(200, 40, "charm99")).toBe(299); // 280 → 2.99
  });

  it("never rounds below cost — steps up to the next shaped value", () => {
    // cost 2550, exact 2550 → 24.99 is a loss: steps to 25.99
    expect(priceFromMarkupRounded(2550, 0, "charm99")).toBe(2599);
    // cost 2500, exact 2500 → dollar rounds to 2500 (equal, kept)
    expect(priceFromMarkupRounded(2500, 0, "dollar")).toBe(2500);
    // sub-unit price keeps the bare ending
    expect(priceFromMarkupRounded(80, 0, "charm95")).toBe(95);
  });

  it("validates the preset name", () => {
    expect(isMarkupRounding("charm99")).toBe(true);
    expect(isMarkupRounding("nearest")).toBe(false);
  });
});
