/* Commerce catalog repo (WEB-180, Commerce C1 1/7) — Snap's persistence for
 * the @webcules/commerce catalog model: studio-wide price lists → products →
 * variants, and the one-active-price-list-per-gallery assignment.
 *
 * Rules enforced here (the wizard/UI in later C1 stories only calls this):
 *  - every read/write is org-scoped (tenant isolation — cross-org ids are
 *    indistinguishable from missing ones);
 *  - plan gates come from the family ROOT's plan via getPlanEntitlements
 *    (quotas pool across a multi-studio family like galleries do);
 *  - money stays integer minor units; markup_pct is DERIVED on read
 *    (@webcules/commerce markupPct) and never stored;
 *  - one active price list per gallery: the partial unique index in
 *    migrations/0067 is the backstop; attach detaches the previous row in
 *    the same batch so the insert can never violate it.
 *
 * Product/variant edit, archive, reorder and the bulk markup tool are
 * WEB-179 (C1 2/7) — this file ships the create/read foundation they build
 * on, plus the validation seams. */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { canCreatePriceList, markupPct, productKindAllowed, validateCurrency, validateName, validateVariantPrices } from "@webcules/commerce";
import type { CatalogError, PlanCommerceGates, ProductKind } from "@webcules/commerce";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getPlanEntitlements } from "@/lib/plans";
import type { PlanDef } from "@/lib/plans";

export type { CatalogError, ProductKind };

/** Local error surface: the core's catalog errors + ownership misses. */
export type CommerceError = CatalogError | "not_found";
export type CommerceResult<T> = { ok: true; value: T } | { ok: false; error: CommerceError };

export type PriceListSummary = {
  id: string;
  name: string;
  currency: string;
  isDefault: boolean;
  productCount: number;
};

export type VariantWithMarkup = {
  id: string;
  productId: string;
  name: string;
  costCents: number;
  priceCents: number;
  /** Derived from (cost, price) — null when cost is 0 (digital goods). */
  markupPct: number | null;
  active: boolean;
  position: number;
};

export type ProductWithVariants = {
  id: string;
  priceListId: string;
  kind: string;
  name: string;
  active: boolean;
  position: number;
  variants: VariantWithMarkup[];
};

export type PriceListDetail = PriceListSummary & {
  organizationId: string;
  products: ProductWithVariants[];
};

/** Plan fields → the core's gate shape (null maxPriceLists = unlimited → -1,
 * the core's "no list cap" convention). */
export function commerceGatesForPlan(def: PlanDef): PlanCommerceGates {
  return {
    storeEnabled: def.storeEnabled,
    maxPriceLists: def.maxPriceLists ?? -1,
    packagesAllowed: def.packagesAllowed,
    customProductsAllowed: def.customProductsAllowed,
  };
}

async function gatesFor(organizationId: string): Promise<PlanCommerceGates | null> {
  const ent = await getPlanEntitlements(organizationId);
  return ent ? commerceGatesForPlan(ent) : null;
}

/** Active price lists owned by THIS org (content is per-org, never shared
 * across a family — only the quota pools). */
export async function listPriceLists(organizationId: string): Promise<PriceListSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.priceLists.id,
      name: schema.priceLists.name,
      currency: schema.priceLists.currency,
      isDefault: schema.priceLists.isDefault,
      productCount: sql<number>`(select count(*) from ${schema.products} where ${schema.products.priceListId} = ${schema.priceLists.id})`,
    })
    .from(schema.priceLists)
    .where(eq(schema.priceLists.organizationId, organizationId))
    .orderBy(asc(schema.priceLists.createdAt));
  return rows.map((r) => ({ ...r, productCount: Number(r.productCount) }));
}

export async function createPriceList(
  organizationId: string,
  input: { name: string; currency: string },
): Promise<CommerceResult<{ id: string; isDefault: boolean }>> {
  const name = validateName(input.name);
  if (!name.ok) return name;
  const currency = validateCurrency(input.currency);
  if (!currency.ok) return currency;

  const db = getDb();
  const ent = await getPlanEntitlements(organizationId);
  if (!ent) return { ok: false, error: "store_disabled" };
  const gates = commerceGatesForPlan(ent);

  // Quota pools across the studio family (same rule as gallery slots).
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.priceLists)
    .where(inArray(schema.priceLists.organizationId, ent.familyOrgIds));
  const gate = canCreatePriceList(gates, Number(n));
  if (!gate.ok) return gate;

  // The org's first list becomes its default; later lists are not.
  const [{ own }] = await db
    .select({ own: sql<number>`count(*)` })
    .from(schema.priceLists)
    .where(eq(schema.priceLists.organizationId, organizationId));
  const isDefault = Number(own) === 0;

  const id = crypto.randomUUID();
  await db.insert(schema.priceLists).values({ id, organizationId, name: name.value, currency: currency.value, isDefault });
  return { ok: true, value: { id, isDefault } };
}

export async function renamePriceList(organizationId: string, priceListId: string, nameInput: string): Promise<CommerceResult<true>> {
  const name = validateName(nameInput);
  if (!name.ok) return name;
  const db = getDb();
  const res = await db
    .update(schema.priceLists)
    .set({ name: name.value, updatedAt: new Date() })
    .where(and(eq(schema.priceLists.id, priceListId), eq(schema.priceLists.organizationId, organizationId)))
    .returning({ id: schema.priceLists.id });
  return res.length > 0 ? { ok: true, value: true } : { ok: false, error: "not_found" };
}

/** Exactly one default list per org: unset the rest in the same batch. */
export async function setDefaultPriceList(organizationId: string, priceListId: string): Promise<CommerceResult<true>> {
  const db = getDb();
  const owned = (await db
    .select({ id: schema.priceLists.id })
    .from(schema.priceLists)
    .where(and(eq(schema.priceLists.id, priceListId), eq(schema.priceLists.organizationId, organizationId)))
    .limit(1))[0];
  if (!owned) return { ok: false, error: "not_found" };
  await db.batch([
    db
      .update(schema.priceLists)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(and(eq(schema.priceLists.organizationId, organizationId), eq(schema.priceLists.isDefault, true))),
    db
      .update(schema.priceLists)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(schema.priceLists.id, priceListId)),
  ]);
  return { ok: true, value: true };
}

export async function getPriceListDetail(organizationId: string, priceListId: string): Promise<PriceListDetail | null> {
  const db = getDb();
  const list = (await db
    .select()
    .from(schema.priceLists)
    .where(and(eq(schema.priceLists.id, priceListId), eq(schema.priceLists.organizationId, organizationId)))
    .limit(1))[0];
  if (!list) return null;

  const [productRows, variantRows] = await Promise.all([
    db.select().from(schema.products).where(eq(schema.products.priceListId, priceListId)).orderBy(asc(schema.products.position), asc(schema.products.createdAt)),
    db
      .select({
        id: schema.productVariants.id,
        productId: schema.productVariants.productId,
        name: schema.productVariants.name,
        costCents: schema.productVariants.costCents,
        priceCents: schema.productVariants.priceCents,
        active: schema.productVariants.active,
        position: schema.productVariants.position,
      })
      .from(schema.productVariants)
      .innerJoin(schema.products, eq(schema.productVariants.productId, schema.products.id))
      .where(eq(schema.products.priceListId, priceListId))
      .orderBy(asc(schema.productVariants.position), asc(schema.productVariants.createdAt)),
  ]);

  const variantsByProduct = new Map<string, VariantWithMarkup[]>();
  for (const v of variantRows) {
    const list0 = variantsByProduct.get(v.productId) ?? [];
    list0.push({ ...v, markupPct: markupPct(v.costCents, v.priceCents) });
    variantsByProduct.set(v.productId, list0);
  }

  return {
    id: list.id,
    organizationId: list.organizationId,
    name: list.name,
    currency: list.currency,
    isDefault: list.isDefault,
    productCount: productRows.length,
    products: productRows.map((p) => ({ ...p, variants: variantsByProduct.get(p.id) ?? [] })),
  };
}

export async function createProduct(
  organizationId: string,
  input: { priceListId: string; kind: ProductKind; name: string },
): Promise<CommerceResult<{ id: string }>> {
  const name = validateName(input.name);
  if (!name.ok) return name;
  const ent = await getPlanEntitlements(organizationId);
  if (!ent) return { ok: false, error: "store_disabled" };
  const kind = productKindAllowed(commerceGatesForPlan(ent), input.kind);
  if (!kind.ok) return kind;

  const db = getDb();
  const list = (await db
    .select({ id: schema.priceLists.id })
    .from(schema.priceLists)
    .where(and(eq(schema.priceLists.id, input.priceListId), eq(schema.priceLists.organizationId, organizationId)))
    .limit(1))[0];
  if (!list) return { ok: false, error: "not_found" };

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${schema.products.position}), -1) + 1` })
    .from(schema.products)
    .where(eq(schema.products.priceListId, input.priceListId));

  const id = crypto.randomUUID();
  await db.insert(schema.products).values({ id, organizationId, priceListId: input.priceListId, kind: kind.value, name: name.value, position: Number(next) });
  return { ok: true, value: { id } };
}

export async function createProductVariant(
  organizationId: string,
  input: { productId: string; name: string; costCents: number; priceCents: number },
): Promise<CommerceResult<{ id: string; markupPct: number | null }>> {
  const name = validateName(input.name);
  if (!name.ok) return name;
  const prices = validateVariantPrices(input.costCents, input.priceCents);
  if (!prices.ok) return prices;

  const db = getDb();
  const product = (await db
    .select({ id: schema.products.id })
    .from(schema.products)
    .where(and(eq(schema.products.id, input.productId), eq(schema.products.organizationId, organizationId)))
    .limit(1))[0];
  if (!product) return { ok: false, error: "not_found" };

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${schema.productVariants.position}), -1) + 1` })
    .from(schema.productVariants)
    .where(eq(schema.productVariants.productId, input.productId));

  const id = crypto.randomUUID();
  await db.insert(schema.productVariants).values({
    id,
    organizationId,
    productId: input.productId,
    name: name.value,
    costCents: prices.value.costCents,
    priceCents: prices.value.priceCents,
    position: Number(next),
  });
  return { ok: true, value: { id, markupPct: prices.value.markupPct } };
}

/** Attach a price list to a gallery. Replaces the current active list (one
 * active per gallery) atomically: the previous row is detached in the same
 * batch as the new row's insert. */
export async function attachPriceListToGrant(
  organizationId: string,
  input: { grantId: string; priceListId: string },
): Promise<CommerceResult<true>> {
  const db = getDb();
  const owned = await Promise.all([
    db
      .select({ id: schema.priceLists.id })
      .from(schema.priceLists)
      .where(and(eq(schema.priceLists.id, input.priceListId), eq(schema.priceLists.organizationId, organizationId)))
      .limit(1),
    db
      .select({ id: schema.shareGrants.id })
      .from(schema.shareGrants)
      .where(and(eq(schema.shareGrants.id, input.grantId), eq(schema.shareGrants.organizationId, organizationId)))
      .limit(1),
  ]);
  if (!owned[0][0] || !owned[1][0]) return { ok: false, error: "not_found" };

  const now = new Date();
  await db.batch([
    db
      .update(schema.priceListGallery)
      .set({ detachedAt: now })
      .where(and(eq(schema.priceListGallery.grantId, input.grantId), isNull(schema.priceListGallery.detachedAt))),
    db.insert(schema.priceListGallery).values({
      id: crypto.randomUUID(),
      organizationId,
      priceListId: input.priceListId,
      grantId: input.grantId,
      attachedAt: now,
    }),
  ]);
  return { ok: true, value: true };
}

/** Remove the active price list from a gallery (history rows stay). */
export async function detachPriceListFromGrant(organizationId: string, grantId: string): Promise<CommerceResult<true>> {
  const db = getDb();
  const res = await db
    .update(schema.priceListGallery)
    .set({ detachedAt: new Date() })
    .where(
      and(
        eq(schema.priceListGallery.grantId, grantId),
        eq(schema.priceListGallery.organizationId, organizationId),
        isNull(schema.priceListGallery.detachedAt),
      ),
    )
    .returning({ id: schema.priceListGallery.id });
  return res.length > 0 ? { ok: true, value: true } : { ok: false, error: "not_found" };
}

/** Client-side read for the gallery store listing (WEB-177 builds on it):
 * the gallery's ACTIVE price list with its active products and variants.
 * Org-scoping is implicit — the grant id is the client's only handle. */
export async function activePriceListForGrant(grantId: string): Promise<PriceListDetail | null> {
  const db = getDb();
  const active = (await db
    .select({ priceListId: schema.priceListGallery.priceListId, organizationId: schema.priceListGallery.organizationId })
    .from(schema.priceListGallery)
    .where(and(eq(schema.priceListGallery.grantId, grantId), isNull(schema.priceListGallery.detachedAt)))
    .limit(1))[0];
  if (!active) return null;

  const detail = await getPriceListDetail(active.organizationId, active.priceListId);
  if (!detail) return null;
  // Client store view: only active products (and their active variants).
  return {
    ...detail,
    products: detail.products
      .filter((p) => p.active)
      .map((p) => ({ ...p, variants: p.variants.filter((v) => v.active) })),
  };
}
