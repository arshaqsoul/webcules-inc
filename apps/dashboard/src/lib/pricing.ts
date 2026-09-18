/**
 * Webcules pricing model — mirrors webcules-inc/docs/PRICING.md.
 * All amounts in CAD dollars. Keep this file and the doc in sync.
 */

export const TIERS = [
  { id: "starter", label: "Starter", minPages: 1, maxPages: 3, base: 499, marketLow: 1500, marketHigh: 2500 },
  { id: "standard", label: "Standard", minPages: 4, maxPages: 6, base: 799, marketLow: 2500, marketHigh: 4500 },
  { id: "plus", label: "Plus", minPages: 7, maxPages: 10, base: 1199, marketLow: 4500, marketHigh: 8000 },
  { id: "premium", label: "Premium", minPages: 11, maxPages: 40, base: 1999, marketLow: 8000, marketHigh: 15000 },
] as const;

export type TierId = (typeof TIERS)[number]["id"];

export const ADDONS = [
  { id: "ordering", label: "Online ordering / menu / e-commerce-lite", price: 400 },
  { id: "booking", label: "Booking / appointment flow", price: 200 },
  { id: "copywriting", label: "Copywriting from scratch", price: 150 },
  { id: "rush", label: "Rush — live in 48 h", price: 200 },
  { id: "extraArt", label: "Extra generated art beyond standard set", price: 100 },
] as const;

export type AddonId = (typeof ADDONS)[number]["id"];

export const MAINTENANCE_MONTHLY = 10;

export const MAX_INSTALLMENT_MONTHS = 6;

/**
 * Split a one-time total into equal monthly payments — same total, no fee.
 * Months scale with the amount (~$100/mo minimum), capped at 6:
 * $499 → 5 × $100 · $799 → 6 × $133 · $1,199 → 6 × $200 · $1,999 → 6 × $333
 */
export function installmentFor(oneTime: number, maxMonths = MAX_INSTALLMENT_MONTHS) {
  const months = Math.min(maxMonths, Math.max(1, Math.ceil(oneTime / 100)));
  return { months, monthly: Math.round(oneTime / months) };
}

/** Round up to the nearest price ending in 99 (849 → 899, 900 → 999). */
function toNicePrice(p: number) {
  const candidate = Math.floor(p / 100) * 100 + 99;
  return p <= candidate ? candidate : candidate + 100;
}

export type Quote = {
  tier: TierId;
  tierLabel: string;
  oneTime: number;
  maintenanceMonthly: number;
  marketLow: number;
  marketHigh: number;
  breakdown: { label: string; amount: number }[];
};

export function computeQuote(pages: number, addonIds: AddonId[]): Quote {
  const p = Math.max(1, Math.min(40, Math.round(pages || 1)));
  const tier = TIERS.find((t) => p >= t.minPages && p <= t.maxPages) ?? (TIERS[TIERS.length - 1] as (typeof TIERS)[number]);
  const addons = ADDONS.filter((a) => addonIds.includes(a.id));
  const addonSum = addons.reduce((s, a) => s + a.price, 0);
  const oneTime = toNicePrice(tier.base + addonSum);
  const round100 = (n: number) => Math.round(n / 100) * 100;
  return {
    tier: tier.id,
    tierLabel: tier.label,
    oneTime,
    maintenanceMonthly: MAINTENANCE_MONTHLY,
    marketLow: round100(tier.marketLow + addonSum * 0.6),
    marketHigh: round100(tier.marketHigh + addonSum * 0.9),
    breakdown: [{ label: `${tier.label} tier (${p} pages)`, amount: tier.base }, ...addons.map((a) => ({ label: a.label, amount: a.price }))],
  };
}
