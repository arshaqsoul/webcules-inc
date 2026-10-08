import { describe, expect, it } from "vitest";

import { MoneyError, markupPct, normalizeCurrency, priceFromMarkup } from "../src/money";

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
