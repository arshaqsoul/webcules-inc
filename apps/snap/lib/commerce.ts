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
import type { BatchItem } from "drizzle-orm/batch";

import { canCreatePriceList, markupPct, priceFromMarkupRounded, productKindAllowed, validateCurrency, validateName, validateVariantPrices } from "@webcules/commerce";
import type { CatalogError, MarkupRounding, PlanCommerceGates, ProductKind } from "@webcules/commerce";

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

/* ── WEB-179 (Commerce C1 2/7): product/variant edit, archive, reorder and
 * the bulk markup tool. Same rules as the foundation above: org-scoped
 * writes (cross-org ids read as not_found), integer minor units, markup
 * derived on read. */

/** Rename a product (org-scoped). */
export async function renameProduct(organizationId: string, productId: string, nameInput: string): Promise<CommerceResult<true>> {
  const name = validateName(nameInput);
  if (!name.ok) return name;
  const db = getDb();
  const res = await db
    .update(schema.products)
    .set({ name: name.value, updatedAt: new Date() })
    .where(and(eq(schema.products.id, productId), eq(schema.products.organizationId, organizationId)))
    .returning({ id: schema.products.id });
  return res.length > 0 ? { ok: true, value: true } : { ok: false, error: "not_found" };
}

/** Archive or restore a product. Archived products stay in the list for
 * audit but drop out of the client store view (activePriceListForGrant). */
export async function setProductActive(organizationId: string, productId: string, active: boolean): Promise<CommerceResult<true>> {
  const db = getDb();
  const res = await db
    .update(schema.products)
    .set({ active, updatedAt: new Date() })
    .where(and(eq(schema.products.id, productId), eq(schema.products.organizationId, organizationId)))
    .returning({ id: schema.products.id });
  return res.length > 0 ? { ok: true, value: true } : { ok: false, error: "not_found" };
}

/** Reorder a price list's products. `productIds` must be exactly the list's
 * current product ids (a permutation, not a subset) — a partial set would
 * shuffle silently and hide a lost row; anything else is not_found. */
export async function reorderProducts(organizationId: string, priceListId: string, productIds: string[]): Promise<CommerceResult<true>> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.products.id })
    .from(schema.products)
    .innerJoin(schema.priceLists, eq(schema.products.priceListId, schema.priceLists.id))
    .where(and(eq(schema.products.priceListId, priceListId), eq(schema.priceLists.organizationId, organizationId)));
  const existing = new Set(rows.map((r) => r.id));
  if (existing.size !== productIds.length || productIds.some((id) => !existing.has(id))) {
    return { ok: false, error: "not_found" };
  }
  const stmts = productIds.map((id, position) =>
    db
      .update(schema.products)
      .set({ position, updatedAt: new Date() })
      .where(and(eq(schema.products.id, id), eq(schema.products.organizationId, organizationId))),
  );
  await db.batch(stmts as [(typeof stmts)[number], ...(typeof stmts)[number][]]);
  return { ok: true, value: true };
}

/** Edit a variant. Fields are optional; omitted ones keep their stored
 * value, and the merged (cost, price) pair runs the core validators so a
 * partial edit can't smuggle in an invalid combination. */
export async function updateProductVariant(
  organizationId: string,
  input: { variantId: string; name?: string; costCents?: number; priceCents?: number },
): Promise<CommerceResult<{ markupPct: number | null }>> {
  const db = getDb();
  const current = (await db
    .select()
    .from(schema.productVariants)
    .where(and(eq(schema.productVariants.id, input.variantId), eq(schema.productVariants.organizationId, organizationId)))
    .limit(1))[0];
  if (!current) return { ok: false, error: "not_found" };

  const nameInput = input.name ?? current.name;
  const name = validateName(nameInput);
  if (!name.ok) return name;
  const prices = validateVariantPrices(
    input.costCents ?? current.costCents,
    input.priceCents ?? current.priceCents,
  );
  if (!prices.ok) return prices;

  await db
    .update(schema.productVariants)
    .set({
      name: name.value,
      costCents: prices.value.costCents,
      priceCents: prices.value.priceCents,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.productVariants.id, input.variantId), eq(schema.productVariants.organizationId, organizationId)));
  return { ok: true, value: { markupPct: markupPct(prices.value.costCents, prices.value.priceCents) } };
}

/** Archive or restore a variant (archived variants drop out of the store view). */
export async function setVariantActive(organizationId: string, variantId: string, active: boolean): Promise<CommerceResult<true>> {
  const db = getDb();
  const res = await db
    .update(schema.productVariants)
    .set({ active, updatedAt: new Date() })
    .where(and(eq(schema.productVariants.id, variantId), eq(schema.productVariants.organizationId, organizationId)))
    .returning({ id: schema.productVariants.id });
  return res.length > 0 ? { ok: true, value: true } : { ok: false, error: "not_found" };
}

/** Reorder a product's variants — same permutation rule as reorderProducts. */
export async function reorderVariants(organizationId: string, productId: string, variantIds: string[]): Promise<CommerceResult<true>> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.productVariants.id })
    .from(schema.productVariants)
    .innerJoin(schema.products, eq(schema.productVariants.productId, schema.products.id))
    .where(and(eq(schema.productVariants.productId, productId), eq(schema.products.organizationId, organizationId)));
  const existing = new Set(rows.map((r) => r.id));
  if (existing.size !== variantIds.length || variantIds.some((id) => !existing.has(id))) {
    return { ok: false, error: "not_found" };
  }
  const stmts = variantIds.map((id, position) =>
    db
      .update(schema.productVariants)
      .set({ position, updatedAt: new Date() })
      .where(and(eq(schema.productVariants.id, id), eq(schema.productVariants.organizationId, organizationId))),
  );
  await db.batch(stmts as [(typeof stmts)[number], ...(typeof stmts)[number][]]);
  return { ok: true, value: true };
}

/** The bulk markup tool: apply a markup percentage to the selected variants,
 * rounding the resulting shelf price to a preset (@webcules/commerce
 * roundPricePreset never rounds below cost). Variants with a zero cost
 * (digital goods — markup is undefined without a cost base) are skipped and
 * reported, not failed. */
export async function applyBulkMarkup(
  organizationId: string,
  input: { variantIds: string[]; markupPct: number; rounding: MarkupRounding },
): Promise<CommerceResult<{ updated: number; skipped: number }>> {
  if (input.variantIds.length === 0) return { ok: false, error: "not_found" };
  const db = getDb();
  const rows = await db
    .select({ id: schema.productVariants.id, costCents: schema.productVariants.costCents })
    .from(schema.productVariants)
    .where(and(inArray(schema.productVariants.id, input.variantIds), eq(schema.productVariants.organizationId, organizationId)));
  if (rows.length === 0) return { ok: false, error: "not_found" };

  const updates = rows
    .filter((r) => r.costCents > 0)
    .map((r) => ({
      id: r.id,
      priceCents: priceFromMarkupRounded(r.costCents, input.markupPct, input.rounding),
    }));
  const stmts = updates.map((u) =>
    db
      .update(schema.productVariants)
      .set({ priceCents: u.priceCents, updatedAt: new Date() })
      .where(and(eq(schema.productVariants.id, u.id), eq(schema.productVariants.organizationId, organizationId))),
  );
  if (stmts.length > 0) await db.batch(stmts as [(typeof stmts)[number], ...(typeof stmts)[number][]]);
  return { ok: true, value: { updated: updates.length, skipped: rows.length - updates.length } };
}

/** Preview for the bulk markup tool: what each selected variant's price
 * would become (and its live markup %) — the UI shows this before applying.
 * Zero-cost variants come back with null previews (they'd be skipped). */
export async function previewBulkMarkup(
  organizationId: string,
  input: { variantIds: string[]; markupPct: number; rounding: MarkupRounding },
): Promise<CommerceResult<Array<{ id: string; name: string; costCents: number; priceCents: number; newPriceCents: number | null; markupPct: number | null }>>> {
  if (input.variantIds.length === 0) return { ok: false, error: "not_found" };
  const db = getDb();
  const rows = await db
    .select({
      id: schema.productVariants.id,
      name: schema.productVariants.name,
      costCents: schema.productVariants.costCents,
      priceCents: schema.productVariants.priceCents,
    })
    .from(schema.productVariants)
    .where(and(inArray(schema.productVariants.id, input.variantIds), eq(schema.productVariants.organizationId, organizationId)));
  if (rows.length === 0) return { ok: false, error: "not_found" };
  return {
    ok: true,
    value: rows.map((r) => ({
      ...r,
      newPriceCents: r.costCents > 0 ? priceFromMarkupRounded(r.costCents, input.markupPct, input.rounding) : null,
      markupPct: r.costCents > 0 ? markupPct(r.costCents, priceFromMarkupRounded(r.costCents, input.markupPct, input.rounding)) : null,
    })),
  };
}

/** Map a CommerceError to an HTTP status for the dashboard API routes
 * (400 validation · 403 plan gate · 404 missing/foreign id). */
export function commerceErrorStatus(error: CommerceError): number {
  switch (error) {
    case "not_found":
      return 404;
    case "store_disabled":
    case "kind_not_allowed":
    case "list_limit_reached":
      return 403;
    default:
      return 400;
  }
}

/* ── WEB-277 (Commerce C1 6/7): the store designer surface — studio-wide
 * open/closed status, first-run template lists, and the products overview.
 * State copy lives in components/store-home.tsx (approved WEB-175 handoff). */

/** Store status is a studio-wide boolean on the profile. Closed hides Buy
 * surfaces at render (the client store consults this in WEB-177); it never
 * deletes lists or unassigns galleries. */
export async function getStoreOpen(organizationId: string): Promise<boolean> {
  const row = (
    await getDb()
      .select({ storeOpen: schema.studioProfiles.storeOpen })
      .from(schema.studioProfiles)
      .where(eq(schema.studioProfiles.organizationId, organizationId))
      .limit(1)
  )[0];
  return row?.storeOpen === true;
}

export async function setStoreOpen(organizationId: string, userId: string, open: boolean): Promise<boolean> {
  const db = getDb();
  const res = await db
    .update(schema.studioProfiles)
    .set({ storeOpen: open, updatedAt: new Date() })
    .where(eq(schema.studioProfiles.organizationId, organizationId))
    .returning({ organizationId: schema.studioProfiles.organizationId });
  if (res.length === 0) return false; // no profile — nothing was changed
  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId,
    actorType: "user",
    actorId: userId,
    action: "store.status_changed",
    targetType: "studio_profile",
    targetId: organizationId,
    meta: JSON.stringify({ open }),
  });
  return true;
}

/** Org-scoped list count — the Setup Guide "store" step signal (WEB-277). */
export async function countPriceLists(organizationId: string): Promise<number> {
  const [{ n }] = await getDb()
    .select({ n: sql<number>`count(*)` })
    .from(schema.priceLists)
    .where(eq(schema.priceLists.organizationId, organizationId));
  return Number(n);
}

/** Products overview row (the Store home's Products tab): one line per
 * product with its list, variant count, and active price range. */
export type ProductOverviewRow = {
  id: string;
  name: string;
  kind: string;
  active: boolean;
  priceListId: string;
  priceListName: string;
  priceListCurrency: string;
  variantCount: number;
  minPriceCents: number | null;
  maxPriceCents: number | null;
};

export async function listAllProducts(organizationId: string): Promise<ProductOverviewRow[]> {
  const rows = await getDb()
    .select({
      id: schema.products.id,
      name: schema.products.name,
      kind: schema.products.kind,
      active: schema.products.active,
      priceListId: schema.priceLists.id,
      priceListName: schema.priceLists.name,
      priceListCurrency: schema.priceLists.currency,
      variantCount: sql<number>`(select count(*) from ${schema.productVariants} where ${schema.productVariants.productId} = ${schema.products.id} and ${schema.productVariants.active} = 1)`,
      minPriceCents: sql<number | null>`(select min(${schema.productVariants.priceCents}) from ${schema.productVariants} where ${schema.productVariants.productId} = ${schema.products.id} and ${schema.productVariants.active} = 1)`,
      maxPriceCents: sql<number | null>`(select max(${schema.productVariants.priceCents}) from ${schema.productVariants} where ${schema.productVariants.productId} = ${schema.products.id} and ${schema.productVariants.active} = 1)`,
    })
    .from(schema.products)
    .innerJoin(schema.priceLists, eq(schema.products.priceListId, schema.priceLists.id))
    .where(and(eq(schema.products.organizationId, organizationId)))
    .orderBy(asc(schema.priceLists.createdAt), asc(schema.products.position));
  return rows.map((r) => ({
    ...r,
    variantCount: Number(r.variantCount),
    minPriceCents: r.minPriceCents === null ? null : Number(r.minPriceCents),
    maxPriceCents: r.maxPriceCents === null ? null : Number(r.maxPriceCents),
  }));
}

/* First-run template price lists (WEB-277). Copy for the template cards is
 * the approved WEB-175 handoff copy — keep the blurbs in sync there. */

export type StoreTemplateId = "portrait" | "wedding" | "event";

export type StoreTemplate = {
  id: StoreTemplateId;
  name: string;
  /** Card blurb, exactly as in the handoff state matrix. */
  blurb: string;
  currency: string;
  products: Array<{ kind: ProductKind; name: string; variants: Array<{ name: string; costCents: number; priceCents: number }> }>;
};

export const STORE_TEMPLATES: Record<StoreTemplateId, StoreTemplate> = {
  portrait: {
    id: "portrait",
    name: "Portrait session",
    blurb: "Digitals, prints, wall art · USD",
    currency: "USD",
    products: [
      {
        kind: "digital",
        name: "Digital collection",
        variants: [
          { name: "Single image", costCents: 0, priceCents: 1200 },
          { name: "10 favorites", costCents: 0, priceCents: 6500 },
        ],
      },
      {
        kind: "print",
        name: "Prints",
        variants: [
          { name: "5×7", costCents: 180, priceCents: 1400 },
          { name: "8×10", costCents: 250, priceCents: 1800 },
        ],
      },
      {
        kind: "print",
        name: "Wall art",
        variants: [
          { name: "16×24", costCents: 2200, priceCents: 9500 },
          { name: "24×36", costCents: 3800, priceCents: 18500 },
        ],
      },
    ],
  },
  wedding: {
    id: "wedding",
    name: "Wedding",
    blurb: "Packages, albums, digitals · USD",
    currency: "USD",
    products: [
      {
        kind: "package",
        name: "Wedding collections",
        variants: [
          { name: "The Essential", costCents: 0, priceCents: 120000 },
          { name: "The Signature", costCents: 0, priceCents: 240000 },
        ],
      },
      {
        kind: "print",
        name: "Albums",
        variants: [
          { name: "10×10 album (30 pages)", costCents: 18000, priceCents: 65000 },
          { name: "12×12 album (40 pages)", costCents: 21000, priceCents: 78000 },
        ],
      },
      {
        kind: "digital",
        name: "Digital negatives",
        variants: [{ name: "Full gallery", costCents: 0, priceCents: 45000 }],
      },
    ],
  },
  event: {
    id: "event",
    name: "Event & corporate",
    blurb: "Digitals, packages, custom · USD",
    currency: "USD",
    products: [
      {
        kind: "digital",
        name: "Event digitals",
        variants: [
          { name: "Per image", costCents: 0, priceCents: 800 },
          { name: "Full event (100+ images)", costCents: 0, priceCents: 32000 },
        ],
      },
      {
        kind: "package",
        name: "Coverage packages",
        variants: [
          { name: "Half day", costCents: 0, priceCents: 90000 },
          { name: "Full day", costCents: 0, priceCents: 160000 },
        ],
      },
      {
        kind: "custom",
        name: "Custom items",
        variants: [{ name: "Quoted per request", costCents: 0, priceCents: 5000 }],
      },
    ],
  },
};

/** One click = one starter list (WEB-277 first run). A single atomic D1
 * batch: list + products + variants all land together or not at all, so a
 * failure leaves the empty state untouched. Plan gates apply: products
 * whose kind the studio's plan doesn't allow (packages/custom) are skipped,
 * and the family-wide list quota is checked exactly like the wizard. */
export async function createPriceListFromTemplate(
  organizationId: string,
  templateId: string,
  userId: string,
): Promise<CommerceResult<{ id: string; skippedKinds: ProductKind[] }>> {
  const template = STORE_TEMPLATES[templateId as StoreTemplateId];
  if (!template) return { ok: false, error: "not_found" };

  const db = getDb();
  const ent = await getPlanEntitlements(organizationId);
  if (!ent) return { ok: false, error: "store_disabled" };
  const gates = commerceGatesForPlan(ent);

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.priceLists)
    .where(inArray(schema.priceLists.organizationId, ent.familyOrgIds));
  const gate = canCreatePriceList(gates, Number(n));
  if (!gate.ok) return gate;

  const [{ own }] = await db
    .select({ own: sql<number>`count(*)` })
    .from(schema.priceLists)
    .where(eq(schema.priceLists.organizationId, organizationId));

  // Validate every variant BEFORE any insert; drop products whose kind the
  // plan doesn't allow (lite: digital/print only — the template adapts).
  const skipped = new Set<ProductKind>();
  const allowed: StoreTemplate["products"] = [];
  for (const p of template.products) {
    const kind = productKindAllowed(gates, p.kind);
    if (!kind.ok) {
      skipped.add(p.kind);
      continue;
    }
    for (const v of p.variants) {
      const prices = validateVariantPrices(v.costCents, v.priceCents);
      if (!prices.ok) return prices; // template data bug — refuse atomically
    }
    allowed.push(p);
  }

  const listId = crypto.randomUUID();
  const now = new Date();
  // Mixed-table batch (list + audit + products + variants) — typed as
  // BatchItem so drizzle accepts the heterogeneous inserts as one atomic D1
  // transaction: all rows land together, or the empty state stays untouched.
  const stmts: BatchItem<"sqlite">[] = [
    db.insert(schema.priceLists).values({
      id: listId,
      organizationId,
      name: template.name,
      currency: template.currency,
      isDefault: Number(own) === 0,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(schema.auditLog).values({
      id: crypto.randomUUID(),
      organizationId,
      actorType: "user",
      actorId: userId,
      action: "store.template_list_created",
      targetType: "price_list",
      targetId: listId,
      meta: JSON.stringify({ template: templateId }),
    }),
  ];
  for (const p of allowed) {
    const productId = crypto.randomUUID();
    stmts.push(
      db.insert(schema.products).values({
        id: productId,
        organizationId,
        priceListId: listId,
        kind: p.kind,
        name: p.name,
        position: allowed.indexOf(p),
        createdAt: now,
        updatedAt: now,
      }),
    );
    p.variants.forEach((v, vi) => {
      stmts.push(
        db.insert(schema.productVariants).values({
          id: crypto.randomUUID(),
          organizationId,
          productId,
          name: v.name,
          costCents: v.costCents,
          priceCents: v.priceCents,
          position: vi,
          createdAt: now,
          updatedAt: now,
        }),
      );
    });
  }
  await db.batch(stmts as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  return { ok: true, value: { id: listId, skippedKinds: [...skipped] } };
}
