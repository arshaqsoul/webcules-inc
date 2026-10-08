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
