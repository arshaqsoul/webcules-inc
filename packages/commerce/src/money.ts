/* Money is always integer minor units (cents) plus an ISO 4217 currency code.
 * No floats cross a function boundary except the markup percentage. */

export type Currency = string;

export class MoneyError extends Error {}

export function assertMinor(value: number, label = "amount"): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new MoneyError(`${label} must be a non-negative integer of minor units`);
  return value;
}

export function normalizeCurrency(code: string): Currency {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) throw new MoneyError(`invalid currency code: ${code}`);
  return c;
}

/** Retail price from a cost and a markup percentage, rounded half up to the minor unit. */
export function priceFromMarkup(costMinor: number, markupPct: number): number {
  assertMinor(costMinor, "cost");
  if (!Number.isFinite(markupPct) || markupPct < 0) throw new MoneyError("markup must be a non-negative number");
  return Math.round(costMinor * (1 + markupPct / 100));
}

/** Markup percentage implied by cost and price, to two decimals. Null when cost is zero (undefined markup). */
export function markupPct(costMinor: number, priceMinor: number): number | null {
  assertMinor(costMinor, "cost");
  assertMinor(priceMinor, "price");
  if (costMinor === 0) return null;
  return Math.round(((priceMinor - costMinor) / costMinor) * 10000) / 100;
}

/* WEB-179 (Commerce C1 2/7) — bulk-markup rounding presets. Applying a
 * percentage to a cost yields "untidy" shelf prices (e.g. 1487¢); stores
 * round them to a house style before they hit the price list. Prices stay
 * integer minor units throughout — only the shape of the final number
 * changes. */

export const MARKUP_ROUNDING_PRESETS = ["none", "dollar", "charm99", "charm95"] as const;
export type MarkupRounding = (typeof MARKUP_ROUNDING_PRESETS)[number];

export function isMarkupRounding(input: string): input is MarkupRounding {
  return (MARKUP_ROUNDING_PRESETS as readonly string[]).includes(input);
}

/** Round a computed retail price (minor units) to a shelf preset:
 *  - none     — exact cost × (1 + markup), half-up to the minor unit
 *  - dollar   — nearest whole currency unit
 *  - charm99  — nearest whole unit, ending .99
 *  - charm95  — nearest whole unit, ending .95
 *
 * The rounded price never drops below the cost: if the preset lands under
 * it, the price steps up to the next preset-shaped value ≥ cost (a store
 * must not round itself into a loss). */
export function roundPricePreset(priceMinor: number, preset: MarkupRounding, costMinor = 0): number {
  assertMinor(priceMinor, "price");
  assertMinor(costMinor, "cost");
  let rounded: number;
  switch (preset) {
    case "none":
      rounded = priceMinor;
      break;
    case "dollar":
      rounded = Math.round(priceMinor / 100) * 100;
      break;
    case "charm99":
    case "charm95": {
      const ending = preset === "charm99" ? 99 : 95;
      const nearestUnit = Math.round(priceMinor / 100) * 100;
      // X.99/X.95 sits just under the nearest whole unit; a sub-unit price
      // keeps the bare ending (0.99/0.95).
      rounded = nearestUnit >= 100 ? nearestUnit - 100 + ending : ending;
      break;
    }
  }
  while (rounded < costMinor) rounded += 100;
  return rounded;
}

/** Cost + markup percentage + rounding preset → shelf price in one step. */
export function priceFromMarkupRounded(costMinor: number, markupPct: number, preset: MarkupRounding): number {
  return roundPricePreset(priceFromMarkup(costMinor, markupPct), preset, costMinor);
}
