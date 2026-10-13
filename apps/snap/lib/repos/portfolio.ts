/* Portfolio core (WEB-305) — curated public collections: the one shared
 * primitive every GO feature renders over (A: portfolio site, B: public API,
 * C: embeddable galleries; WEB-301 §3.1 data model, WEB-302 §4 tier caps).
 *
 * Doctrine:
 * - Items POINT at existing assets — bytes and storage_key never move
 *   (WEB-216). Deleting a project removes its items via cascade: intended.
 * - Public-ness is explicit: only assets placed in a collection are
 *   publicly servable. Collection membership is the safety boundary.
 * - Tier caps (maxPortfolioCollections / maxPortfolioItems, org-wide) are
 *   enforced HERE, on every write path — never only in hidden UI (the
 *   standing store-designer lesson). Callers pass the caps from
 *   getPlanEntitlements so this repo stays free of plan imports.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "../db";
import * as schema from "../db-schema";
import { pubimgLink, purgePubimgCache } from "../pubimg-link";

export type PortfolioSiteRow = typeof schema.portfolioSites.$inferSelect;
export type PortfolioCollectionRow = typeof schema.portfolioCollections.$inferSelect;
export type PortfolioCollectionAssetRow = typeof schema.portfolioCollectionAssets.$inferSelect;

export type PortfolioError =
  | "invalid_title"
  | "invalid_slug"
  | "invalid_values"
  | "invalid_status"
  | "limit_reached"
  | "not_found"
  | "not_owned"
  | "not_image"
  | "empty_site";

const SITE_STATUSES = ["draft", "published", "unlisted"] as const;
const VISIBILITIES = ["public", "unlisted"] as const;
/** JSON payload cap per field (theme/home/seo/displayCrop) — generous for
 * token vocabulary, small enough to never be a storage abuse vector. */
const JSON_MAX_BYTES = 16 * 1024;
const SLUG_MAX = 40;

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, SLUG_MAX) || "portfolio"
  );
}

/** Validate a client-supplied slug (site rename / collection slug pick). */
export function validSlug(input: string): string | null {
  const s = slugify(input);
  return s === "portfolio" ? null : s;
}

/** Serialize a JSON-object field under the byte cap; null = reject. */
function jsonField(value: unknown): string | null {
  if (value === null || value === undefined) return "{}";
  if (typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const s = JSON.stringify(value);
    return s.length <= JSON_MAX_BYTES ? s : null;
  } catch {
    return null;
  }
}

/* ------------------------------- site ------------------------------- */

async function siteSlugTaken(slug: string, ignoreOrg?: string): Promise<boolean> {
  const rows = await getDb()
    .select({ organizationId: schema.portfolioSites.organizationId })
    .from(schema.portfolioSites)
    .where(eq(schema.portfolioSites.slug, slug))
    .limit(1);
  return !!rows[0] && rows[0].organizationId !== ignoreOrg;
}

/** Global-unique site slug: exact if free, then short nonce suffixes
 * (WEB-301: "nonce-suffixed on collision" — public URL namespace). */
async function uniqueSiteSlug(base: string, ignoreOrg?: string): Promise<string> {
  if (!(await siteSlugTaken(base, ignoreOrg))) return base;
  for (let i = 0; i < 8; i++) {
    const candidate = `${base}-${crypto.randomUUID().slice(0, 4)}`;
    if (!(await siteSlugTaken(candidate, ignoreOrg))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function getPortfolioSite(organizationId: string): Promise<PortfolioSiteRow | null> {
  const rows = await getDb()
    .select()
    .from(schema.portfolioSites)
    .where(eq(schema.portfolioSites.organizationId, organizationId))
    .limit(1);
  return rows[0] ?? null;
}

/** Idempotent lazy init: every org may draft; the row is created on first
 * touch from the org's name (nonce-suffixed if the public slug is taken). */
export async function getOrCreatePortfolioSite(
  organizationId: string,
  baseName: string,
): Promise<PortfolioSiteRow> {
  const existing = await getPortfolioSite(organizationId);
  if (existing) return existing;
  const slug = await uniqueSiteSlug(slugify(baseName));
  const db = getDb();
  await db
    .insert(schema.portfolioSites)
    .values({ organizationId, slug })
    .onConflictDoNothing();
  return (await getPortfolioSite(organizationId))!;
}

/** Route convenience: lazy-init keyed off the org's own name. */
export async function ensurePortfolioSite(organizationId: string): Promise<PortfolioSiteRow> {
  const org = (
    await getDb()
      .select({ name: schema.organization.name })
      .from(schema.organization)
      .where(eq(schema.organization.id, organizationId))
      .limit(1)
  )[0];
  return getOrCreatePortfolioSite(organizationId, org?.name ?? "Studio");
}

export async function getPortfolioSiteBySlug(slug: string): Promise<PortfolioSiteRow | null> {
  const rows = await getDb()
    .select()
    .from(schema.portfolioSites)
    .where(eq(schema.portfolioSites.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

export type SiteUpdateInput = {
  slug?: string;
  status?: string;
  theme?: unknown;
  home?: unknown;
  seo?: unknown;
};

export async function updatePortfolioSite(
  organizationId: string,
  input: SiteUpdateInput,
): Promise<{ ok: true; site: PortfolioSiteRow } | { ok: false; error: PortfolioError }> {
  const existing = await getPortfolioSite(organizationId);
  if (!existing) return { ok: false, error: "not_found" };
  const db = getDb();
  const set: Partial<PortfolioSiteRow> = { updatedAt: new Date() };

  // Leaving `published` (or changing slug) revokes every pubimg URL: eagerly
  // purge the org's curated assets from the edge cache (WEB-345). The bump of
  // site.updated_at below also rotates the cache revision, so anything the
  // capped eager sweep misses becomes unreachable regardless.
  if (input.status !== undefined && input.status !== existing.status) {
    await purgeOrgPortfolioImages(organizationId);
  }

  if (input.slug !== undefined) {
    const slug = validSlug(input.slug);
    if (!slug) return { ok: false, error: "invalid_slug" };
    set.slug = await uniqueSiteSlug(slug, organizationId);
  }
  if (input.status !== undefined) {
    if (!(SITE_STATUSES as readonly string[]).includes(input.status)) {
      return { ok: false, error: "invalid_status" };
    }
    // Publishing a site requires something to show: at least one visible
    // collection with at least one curated item (never a blank public page).
    if (input.status !== "draft" && existing.status === "draft") {
      const ready = await db
        .select({ n: sql<number>`count(*)` })
        .from(schema.portfolioCollections)
        .where(
          and(
            eq(schema.portfolioCollections.organizationId, organizationId),
            eq(schema.portfolioCollections.visibility, "public"),
            sql`exists (select 1 from portfolio_collection_asset a where a.collection_id = portfolio_collection.id)`,
          ),
        );
      if ((ready[0]?.n ?? 0) < 1) return { ok: false, error: "empty_site" };
    }
    if (input.status === "published" && existing.status !== "published") {
      set.publishedAt = new Date();
    }
    set.status = input.status;
  }
  for (const field of ["theme", "home", "seo"] as const) {
    const value = input[field];
    if (value === undefined) continue;
    const serialized = jsonField(value);
    if (serialized === null) return { ok: false, error: "invalid_values" };
    set[field] = serialized;
  }

  await db
    .update(schema.portfolioSites)
    .set(set)
    .where(eq(schema.portfolioSites.organizationId, organizationId));
  return { ok: true, site: (await getPortfolioSite(organizationId))! };
}

/* ---------------------------- collections ---------------------------- */

export type CollectionSummary = PortfolioCollectionRow & { itemCount: number };

export async function listCollections(organizationId: string): Promise<CollectionSummary[]> {
  const rows = await getDb()
    .select({
      collection: schema.portfolioCollections,
      itemCount: sql<number>`(select count(*) from portfolio_collection_asset a where a.collection_id = portfolio_collection.id)`,
    })
    .from(schema.portfolioCollections)
    .where(eq(schema.portfolioCollections.organizationId, organizationId))
    .orderBy(asc(schema.portfolioCollections.sort), asc(schema.portfolioCollections.createdAt));
  return rows.map((r) => ({ ...r.collection, itemCount: r.itemCount }));
}

async function getOwnedCollection(
  organizationId: string,
  id: string,
): Promise<PortfolioCollectionRow | null> {
  const rows = await getDb()
    .select()
    .from(schema.portfolioCollections)
    .where(
      and(
        eq(schema.portfolioCollections.id, id),
        eq(schema.portfolioCollections.organizationId, organizationId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export type CollectionInput = {
  title?: string | null;
  subtitle?: string | null;
  coverAssetId?: string | null;
  visibility?: string | null;
};

export async function createCollection(
  organizationId: string,
  input: CollectionInput,
  maxCollections: number | null,
): Promise<{ ok: true; collection: PortfolioCollectionRow } | { ok: false; error: PortfolioError }> {
  const title = input.title?.trim().slice(0, 80);
  if (!title) return { ok: false, error: "invalid_title" };
  const subtitle = input.subtitle ? input.subtitle.trim().slice(0, 160) || null : null;
  const visibility =
    input.visibility && (VISIBILITIES as readonly string[]).includes(input.visibility)
      ? input.visibility
      : "public";
  const db = getDb();

  if (maxCollections !== null) {
    const rows = await db
      .select({ n: sql<number>`count(*)` })
      .from(schema.portfolioCollections)
      .where(eq(schema.portfolioCollections.organizationId, organizationId));
    if ((rows[0]?.n ?? 0) >= maxCollections) return { ok: false, error: "limit_reached" };
  }
  if (input.coverAssetId) {
    const owned = await db
      .select({ id: schema.assets.id })
      .from(schema.assets)
      .where(and(eq(schema.assets.id, input.coverAssetId), eq(schema.assets.organizationId, organizationId)))
      .limit(1);
    if (!owned[0]) return { ok: false, error: "not_owned" };
  }

  const id = crypto.randomUUID();
  const base = slugify(title);
  let slug = base;
  for (let i = 0; i < 20; i++) {
    const clash = await db
      .select({ id: schema.portfolioCollections.id })
      .from(schema.portfolioCollections)
      .where(
        and(
          eq(schema.portfolioCollections.organizationId, organizationId),
          eq(schema.portfolioCollections.slug, slug),
        ),
      )
      .limit(1);
    if (!clash[0]) break;
    slug = `${base}-${i + 2}`;
  }
  const sortOrder = (
    await db
      .select({ n: sql<number>`coalesce(max(sort), 0)` })
      .from(schema.portfolioCollections)
      .where(eq(schema.portfolioCollections.organizationId, organizationId))
  )[0].n + 1;

  await db.insert(schema.portfolioCollections).values({
    id,
    organizationId,
    slug,
    title,
    subtitle,
    coverAssetId: input.coverAssetId ?? null,
    visibility,
    sort: sortOrder,
  });
  return { ok: true, collection: (await getOwnedCollection(organizationId, id))! };
}

export async function updateCollection(
  organizationId: string,
  id: string,
  input: CollectionInput,
): Promise<{ ok: true; collection: PortfolioCollectionRow } | { ok: false; error: PortfolioError }> {
  const existing = await getOwnedCollection(organizationId, id);
  if (!existing) return { ok: false, error: "not_found" };
  const title = input.title === undefined ? existing.title : input.title?.trim().slice(0, 80);
  if (!title) return { ok: false, error: "invalid_title" };
  const subtitle =
    input.subtitle === undefined
      ? existing.subtitle
      : input.subtitle
        ? input.subtitle.trim().slice(0, 160) || null
        : null;
  const visibility =
    input.visibility === undefined
      ? existing.visibility
      : input.visibility && (VISIBILITIES as readonly string[]).includes(input.visibility)
        ? input.visibility
        : null;
  if (visibility === null) return { ok: false, error: "invalid_values" };
  const coverAssetId =
    input.coverAssetId === undefined ? existing.coverAssetId : input.coverAssetId;

  if (coverAssetId) {
    const owned = await getDb()
      .select({ id: schema.assets.id })
      .from(schema.assets)
      .where(and(eq(schema.assets.id, coverAssetId), eq(schema.assets.organizationId, organizationId)))
      .limit(1);
    if (!owned[0]) return { ok: false, error: "not_owned" };
  }

  await getDb()
    .update(schema.portfolioCollections)
    .set({ title, subtitle, visibility, coverAssetId, updatedAt: new Date() })
    .where(
      and(
        eq(schema.portfolioCollections.id, id),
        eq(schema.portfolioCollections.organizationId, organizationId),
      ),
    );
  // Visibility flips change what is publicly servable: eagerly purge the
  // collection's assets and rotate the site revision (WEB-345).
  if (visibility !== existing.visibility) {
    const rev = await currentSiteRevision(organizationId);
    const members = await getDb()
      .select({ assetId: schema.portfolioCollectionAssets.assetId })
      .from(schema.portfolioCollectionAssets)
      .where(eq(schema.portfolioCollectionAssets.collectionId, id));
    for (const m of members) await purgePubimgCache(m.assetId, rev);
    await touchSiteRevision(organizationId);
  }
  return { ok: true, collection: (await getOwnedCollection(organizationId, id))! };
}

/** Delete never cascades to assets — only the curation pointers go. */
export async function deleteCollection(
  organizationId: string,
  id: string,
): Promise<boolean> {
  const rev = await currentSiteRevision(organizationId);
  const members = await getDb()
    .select({ assetId: schema.portfolioCollectionAssets.assetId })
    .from(schema.portfolioCollectionAssets)
    .where(eq(schema.portfolioCollectionAssets.collectionId, id));
  const rows = await getDb()
    .delete(schema.portfolioCollections)
    .where(
      and(
        eq(schema.portfolioCollections.id, id),
        eq(schema.portfolioCollections.organizationId, organizationId),
      ),
    )
    .returning({ id: schema.portfolioCollections.id });
  if (rows.length > 0) {
    for (const m of members) await purgePubimgCache(m.assetId, rev);
    await touchSiteRevision(organizationId);
  }
  return rows.length > 0;
}

/* --------------------------- curation items --------------------------- */

/** Org-wide curated item count (the maxPortfolioItems cap is org-wide). */
export async function countPortfolioItems(organizationId: string): Promise<number> {
  const rows = await getDb()
    .select({ n: sql<number>`count(*)` })
    .from(schema.portfolioCollectionAssets)
    .innerJoin(
      schema.portfolioCollections,
      eq(schema.portfolioCollectionAssets.collectionId, schema.portfolioCollections.id),
    )
    .where(eq(schema.portfolioCollections.organizationId, organizationId));
  return rows[0]?.n ?? 0;
}

export async function listCollectionAssets(
  organizationId: string,
  collectionId: string,
): Promise<(PortfolioCollectionAssetRow & { asset: typeof schema.assets.$inferSelect })[]> {
  const rows = await getDb()
    .select({ item: schema.portfolioCollectionAssets, asset: schema.assets })
    .from(schema.portfolioCollectionAssets)
    .innerJoin(
      schema.assets,
      eq(schema.portfolioCollectionAssets.assetId, schema.assets.id),
    )
    .innerJoin(
      schema.portfolioCollections,
      eq(schema.portfolioCollectionAssets.collectionId, schema.portfolioCollections.id),
    )
    .where(
      and(
        eq(schema.portfolioCollections.organizationId, organizationId),
        eq(schema.portfolioCollectionAssets.collectionId, collectionId),
      ),
    )
    .orderBy(asc(schema.portfolioCollectionAssets.sort), asc(schema.portfolioCollectionAssets.createdAt));
  return rows.map((r) => ({ ...r.item, asset: r.asset }));
}

export type AddAssetsResult =
  | { ok: true; added: number }
  | { ok: false; error: PortfolioError; rejected?: string[] };

/** Add assets to a collection. Every asset must belong to the SAME org and
 * be kind='image' (public collections serve web-size image derivatives only
 * — never originals, never RAW). The org-wide item cap applies to the
 * actually-new items only (re-adding an existing member is a no-op). */
export async function addAssetsToCollection(
  organizationId: string,
  collectionId: string,
  assetIds: string[],
  maxItems: number | null,
): Promise<AddAssetsResult> {
  const collection = await getOwnedCollection(organizationId, collectionId);
  if (!collection) return { ok: false, error: "not_found" };
  const ids = [...new Set(assetIds.filter((id) => typeof id === "string"))];
  if (!ids.length) return { ok: false, error: "invalid_values" };
  const db = getDb();

  const assets = await db
    .select({ id: schema.assets.id, kind: schema.assets.kind })
    .from(schema.assets)
    .where(and(inArray(schema.assets.id, ids), eq(schema.assets.organizationId, organizationId)));
  const ownedIds = new Set(assets.map((a) => a.id));
  const notOwned = ids.filter((id) => !ownedIds.has(id));
  if (notOwned.length) return { ok: false, error: "not_owned", rejected: notOwned };
  const notImage = assets.filter((a) => a.kind !== "image").map((a) => a.id);
  if (notImage.length) return { ok: false, error: "not_image", rejected: notImage };

  const thisCollection = await db
    .select({ assetId: schema.portfolioCollectionAssets.assetId })
    .from(schema.portfolioCollectionAssets)
    .where(
      and(
        eq(schema.portfolioCollectionAssets.collectionId, collectionId),
        inArray(schema.portfolioCollectionAssets.assetId, ids),
      ),
    );
  const alreadyHere = new Set(thisCollection.map((r) => r.assetId));
  // Same-org items may appear in multiple collections (a hero shot can lead
  // two) — re-adding to THIS collection is a no-op; a new row here still
  // counts against the org-wide item cap below.
  const fresh = ids.filter((id) => !alreadyHere.has(id));

  if (fresh.length && maxItems !== null) {
    const current = await countPortfolioItems(organizationId);
    if (current + fresh.length > maxItems) return { ok: false, error: "limit_reached" };
  }

  if (fresh.length) {
    const nextSort = (
      await db
        .select({ n: sql<number>`coalesce(max(sort), 0)` })
        .from(schema.portfolioCollectionAssets)
        .where(eq(schema.portfolioCollectionAssets.collectionId, collectionId))
    )[0].n;
    // D1 caps bound parameters per statement (~100) — insert in row chunks.
    const CHUNK = 10;
    for (let i = 0; i < fresh.length; i += CHUNK) {
      await db
        .insert(schema.portfolioCollectionAssets)
        .values(
          fresh.slice(i, i + CHUNK).map((assetId, j) => ({
            id: crypto.randomUUID(),
            collectionId,
            assetId,
            sort: nextSort + 1 + i + j,
          })),
        )
        .onConflictDoNothing();
    }
  }
  await db
    .update(schema.portfolioCollections)
    .set({ updatedAt: new Date() })
    .where(eq(schema.portfolioCollections.id, collectionId));
  return { ok: true, added: fresh.length };
}

export async function removeAssetFromCollection(
  organizationId: string,
  collectionId: string,
  assetId: string,
): Promise<boolean> {
  const collection = await getOwnedCollection(organizationId, collectionId);
  if (!collection) return false;
  const rev = await currentSiteRevision(organizationId);
  const rows = await getDb()
    .delete(schema.portfolioCollectionAssets)
    .where(
      and(
        eq(schema.portfolioCollectionAssets.collectionId, collectionId),
        eq(schema.portfolioCollectionAssets.assetId, assetId),
      ),
    )
    .returning({ id: schema.portfolioCollectionAssets.id });
  if (rows.length > 0) {
    // Curated-out = revoked (WEB-345 AC): eagerly purge the edge entry and
    // rotate the revision so the next pubimg fetch 404s immediately.
    await purgePubimgCache(assetId, rev);
    await touchSiteRevision(organizationId);
  }
  return rows.length > 0;
}

export type AssetMetaInput = {
  caption?: string | null;
  altText?: string | null;
  displayCrop?: unknown;
};

export async function updateCollectionAsset(
  organizationId: string,
  collectionId: string,
  assetId: string,
  input: AssetMetaInput,
): Promise<{ ok: true } | { ok: false; error: PortfolioError }> {
  const collection = await getOwnedCollection(organizationId, collectionId);
  if (!collection) return { ok: false, error: "not_found" };
  const set: Record<string, unknown> = {};
  if (input.caption !== undefined)
    set.caption = input.caption ? input.caption.trim().slice(0, 300) || null : null;
  if (input.altText !== undefined)
    set.altText = input.altText ? input.altText.trim().slice(0, 300) || null : null;
  if (input.displayCrop !== undefined) {
    if (input.displayCrop === null) set.displayCrop = null;
    else {
      const s = jsonField(input.displayCrop);
      if (s === null) return { ok: false, error: "invalid_values" };
      set.displayCrop = s;
    }
  }
  if (Object.keys(set).length) {
    await getDb()
      .update(schema.portfolioCollectionAssets)
      .set(set)
      .where(
        and(
          eq(schema.portfolioCollectionAssets.collectionId, collectionId),
          eq(schema.portfolioCollectionAssets.assetId, assetId),
        ),
      );
  }
  return { ok: true };
}

/** Explicit reorder: the ordered id list IS the new sort order; ids not in
 * the collection are rejected (never silently ignored). */
export async function reorderCollectionAssets(
  organizationId: string,
  collectionId: string,
  orderedIds: string[],
): Promise<{ ok: true } | { ok: false; error: PortfolioError }> {
  const collection = await getOwnedCollection(organizationId, collectionId);
  if (!collection) return { ok: false, error: "not_found" };
  const ids = [...new Set(orderedIds)];
  const current = await getDb()
    .select({ assetId: schema.portfolioCollectionAssets.assetId })
    .from(schema.portfolioCollectionAssets)
    .where(eq(schema.portfolioCollectionAssets.collectionId, collectionId));
  const currentSet = new Set(current.map((r) => r.assetId));
  if (ids.length !== current.length || ids.some((id) => !currentSet.has(id))) {
    return { ok: false, error: "invalid_values" };
  }
  const db = getDb();
  for (let i = 0; i < ids.length; i++) {
    await db
      .update(schema.portfolioCollectionAssets)
      .set({ sort: i + 1 })
      .where(
        and(
          eq(schema.portfolioCollectionAssets.collectionId, collectionId),
          eq(schema.portfolioCollectionAssets.assetId, ids[i]),
        ),
      );
  }
  return { ok: true };
}

/* --------------------------- public payload --------------------------- */

/** The pubimg revision for an org = portfolio_site.updated_at (seconds).
 * Every revoking mutation (curate-out, unlist, unpublish, delete) bumps it,
 * which rotates the /api/pubimg edge-cache keys (WEB-345). */
async function currentSiteRevision(organizationId: string): Promise<number> {
  const site = await getPortfolioSite(organizationId);
  return site?.updatedAt ? Math.floor(site.updatedAt.getTime() / 1000) : 0;
}

async function touchSiteRevision(organizationId: string): Promise<void> {
  await getDb()
    .update(schema.portfolioSites)
    .set({ updatedAt: new Date() })
    .where(eq(schema.portfolioSites.organizationId, organizationId));
}

/** Eagerly purge an org's curated assets from the pubimg edge cache
 * (publish/unpublish transitions). Capped: the revision bump that follows
 * makes every missed entry unreachable anyway — this sweep just reclaims
 * the popular ones promptly. */
export async function purgeOrgPortfolioImages(organizationId: string, cap = 200): Promise<void> {
  const rev = await currentSiteRevision(organizationId);
  const rows = await getDb()
    .select({ assetId: schema.portfolioCollectionAssets.assetId })
    .from(schema.portfolioCollectionAssets)
    .innerJoin(
      schema.portfolioCollections,
      eq(schema.portfolioCollectionAssets.collectionId, schema.portfolioCollections.id),
    )
    .where(eq(schema.portfolioCollections.organizationId, organizationId))
    .limit(cap);
  for (const r of rows) await purgePubimgCache(r.assetId, rev);
}

/** Live public-ness resolve for /api/pubimg/{assetId} (WEB-345): the asset
 * is servable iff it is curated into a PUBLIC collection of a PUBLISHED
 * site and is kind='image'. Called on EVERY pubimg request (before any
 * cache lookup), so curating out / unpublishing 404s immediately. */
export type PublicPortfolioImage = {
  organizationId: string;
  assetId: string;
  previewKey: string | null;
  previewWmKey: string | null;
  width: number | null;
  height: number | null;
  /** Epoch seconds of the site revision — part of the edge-cache key. */
  revision: number;
};

export async function resolvePublicPortfolioImage(assetId: string): Promise<PublicPortfolioImage | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(assetId)) return null;
  const rows = await getDb()
    .select({
      organizationId: schema.assets.organizationId,
      kind: schema.assets.kind,
      previewKey: schema.assets.previewKey,
      previewWmKey: schema.assets.previewWmKey,
      width: schema.assets.width,
      height: schema.assets.height,
      siteUpdatedAt: schema.portfolioSites.updatedAt,
    })
    .from(schema.portfolioCollectionAssets)
    .innerJoin(
      schema.portfolioCollections,
      eq(schema.portfolioCollectionAssets.collectionId, schema.portfolioCollections.id),
    )
    .innerJoin(
      schema.portfolioSites,
      eq(schema.portfolioCollections.organizationId, schema.portfolioSites.organizationId),
    )
    .innerJoin(schema.assets, eq(schema.portfolioCollectionAssets.assetId, schema.assets.id))
    .where(
      and(
        eq(schema.portfolioCollectionAssets.assetId, assetId),
        eq(schema.assets.kind, "image"),
        eq(schema.portfolioCollections.visibility, "public"),
        eq(schema.portfolioSites.status, "published"),
      ),
    )
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    organizationId: r.organizationId,
    assetId,
    previewKey: r.previewKey,
    previewWmKey: r.previewWmKey,
    width: r.width,
    height: r.height,
    revision: r.siteUpdatedAt ? Math.floor(r.siteUpdatedAt.getTime() / 1000) : 0,
  };
}

export type PublicPortfolioItem = {
  assetId: string;
  sort: number;
  caption: string | null;
  altText: string | null;
  /** Signed /api/pubimg URL — the ONLY image handle the public payload
   * carries; R2 keys stay private (WEB-345). */
  image: string;
  width: number | null;
  height: number | null;
};

export type PublicPortfolioCollection = {
  slug: string;
  title: string;
  subtitle: string | null;
  items: PublicPortfolioItem[];
};

export type PublicPortfolio = {
  slug: string;
  theme: unknown;
  home: unknown;
  seo: unknown;
  publishedAt: Date | null;
  collections: PublicPortfolioCollection[];
};

/** The public read surface (feature A pages, C embeds, B API all consume
 * this): a site ONLY if published, ONLY visible collections, ONLY curated
 * items — an asset not curated in is structurally absent, never 404-noise. */
export async function getPublishedPortfolio(slug: string): Promise<PublicPortfolio | null> {
  const site = await getPortfolioSiteBySlug(slug);
  if (!site || site.status !== "published") return null;
  const db = getDb();
  const collections = await db
    .select()
    .from(schema.portfolioCollections)
    .where(
      and(
        eq(schema.portfolioCollections.organizationId, site.organizationId),
        eq(schema.portfolioCollections.visibility, "public"),
      ),
    )
    .orderBy(asc(schema.portfolioCollections.sort), asc(schema.portfolioCollections.createdAt));
  const withItems: PublicPortfolioCollection[] = [];
  for (const c of collections) {
    const items = await db
      .select({
        item: schema.portfolioCollectionAssets,
        width: schema.assets.width,
        height: schema.assets.height,
      })
      .from(schema.portfolioCollectionAssets)
      .innerJoin(schema.assets, eq(schema.portfolioCollectionAssets.assetId, schema.assets.id))
      .where(eq(schema.portfolioCollectionAssets.collectionId, c.id))
      .orderBy(asc(schema.portfolioCollectionAssets.sort), asc(schema.portfolioCollectionAssets.createdAt));
    withItems.push({
      slug: c.slug,
      title: c.title,
      subtitle: c.subtitle,
      items: await Promise.all(
        items.map(async ({ item, width, height }) => ({
          assetId: item.assetId,
          sort: item.sort,
          caption: item.caption,
          altText: item.altText,
          image: await pubimgLink(item.assetId),
          width,
          height,
        })),
      ),
    });
  }
  const parse = (s: string): unknown => {
    try {
      return JSON.parse(s);
    } catch {
      return {};
    }
  };
  return {
    slug: site.slug,
    theme: parse(site.theme),
    home: parse(site.home),
    seo: parse(site.seo),
    publishedAt: site.publishedAt,
    collections: withItems,
  };
}
