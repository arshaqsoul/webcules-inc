/* Catalog model shared by every host: price lists hold products, products hold variants.
 * Pure types and validation - persistence lives in the host's repo layer. */
import { assertMinor, markupPct, normalizeCurrency, type Currency } from "./money";

export const PRODUCT_KINDS = ["digital", "print", "package", "custom"] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

export type PriceList = {
  id: string;
  organizationId: string;
  name: string;
  /** One currency per list, locked at creation. */
  currency: Currency;
  isDefault: boolean;
};

export type Product = {
  id: string;
  priceListId: string;
  kind: ProductKind;
  name: string;
  active: boolean;
};

export type ProductVariant = {
  id: string;
  productId: string;
  name: string;
  /** What the photographer pays a lab; 0 for digital goods. */
  costCents: number;
  priceCents: number;
};

export type PlanCommerceGates = {
  storeEnabled: boolean;
  maxPriceLists: number;
  packagesAllowed: boolean;
  customProductsAllowed: boolean;
};

export type CatalogError = "invalid_name" | "invalid_currency" | "invalid_amount" | "invalid_kind" | "kind_not_allowed" | "list_limit_reached" | "store_disabled";

export type Result<T> = { ok: true; value: T } | { ok: false; error: CatalogError };

export function validateName(input: string, max = 80): Result<string> {
  const name = input.trim().slice(0, max);
  return name ? { ok: true, value: name } : { ok: false, error: "invalid_name" };
}

export function validateCurrency(input: string): Result<Currency> {
  try {
    return { ok: true, value: normalizeCurrency(input) };
  } catch {
    return { ok: false, error: "invalid_currency" };
  }
}

export function validateVariantPrices(costCents: number, priceCents: number): Result<{ costCents: number; priceCents: number; markupPct: number | null }> {
  try {
    assertMinor(costCents, "cost");
    assertMinor(priceCents, "price");
  } catch {
    return { ok: false, error: "invalid_amount" };
  }
  return { ok: true, value: { costCents, priceCents, markupPct: markupPct(costCents, priceCents) } };
}

/** Whether the plan may create this kind of product. Digital and print need the store; packages and custom need their own flag. */
export function productKindAllowed(gates: PlanCommerceGates, kind: ProductKind): Result<ProductKind> {
  if (!(PRODUCT_KINDS as readonly string[]).includes(kind)) return { ok: false, error: "invalid_kind" };
  if (!gates.storeEnabled) return { ok: false, error: "store_disabled" };
  if (kind === "package" && !gates.packagesAllowed) return { ok: false, error: "kind_not_allowed" };
  if (kind === "custom" && !gates.customProductsAllowed) return { ok: false, error: "kind_not_allowed" };
  return { ok: true, value: kind };
}

/** Whether the org may create another price list given how many it has. */
export function canCreatePriceList(gates: PlanCommerceGates, existing: number): Result<true> {
  if (!gates.storeEnabled) return { ok: false, error: "store_disabled" };
  if (gates.maxPriceLists >= 0 && existing >= gates.maxPriceLists) return { ok: false, error: "list_limit_reached" };
  return { ok: true, value: true };
}
