/* Client-home repository (WEB-263) — everything one email owns: active
 * galleries (with cover + counts) and pre-open sneak peeks (Studio orgs
 * only). Cards stay read-only summaries; opening a gallery goes through
 * the /api/my/open handoff which mints that grant's own session cookie. */
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getPlanEntitlements } from "@/lib/plans";
import { parseGalleryDesignJson } from "@/lib/gallery-design";

export type MyGalleryCard = {
  grantId: string;
  organizationId: string;
  projectId: string;
  projectTitle: string;
  studioName: string;
  accent: string;
  assetCount: number;
  favoritesCount: number;
  expiresAt: number | null;
  coverAssetId: string | null;
  updatedAt: number;
};

export type MyPeekProject = {
  projectId: string;
  projectTitle: string;
  studioName: string;
  assetIds: string[];
  createdAt: number;
};

export async function listMyGalleries(email: string): Promise<MyGalleryCard[]> {
  const db = getDb();
  const e = email.toLowerCase();
  const rows = await db
    .select({
      grantId: schema.shareGrants.id,
      organizationId: schema.shareGrants.organizationId,
      projectId: schema.shareGrants.projectId,
      expiresAt: schema.shareGrants.expiresAt,
      createdAt: schema.shareGrants.createdAt,
      projectTitle: schema.projects.title,
      design: schema.projects.galleryDesign,
      studioName: schema.studioProfiles.studioName,
      brand: schema.studioProfiles.brand,
    })
    .from(schema.shareGrants)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.shareGrants.projectId))
    .leftJoin(schema.studioProfiles, eq(schema.studioProfiles.organizationId, schema.shareGrants.organizationId))
    .where(and(eq(schema.shareGrants.clientEmail, e), eq(schema.shareGrants.status, "active")))
    .orderBy(desc(schema.shareGrants.createdAt))
    .limit(50);

  // WEB-267 gate: /my lists paid orgs' galleries only (Lite+). Free orgs'
  // gallery links keep working directly — they just don't surface here.
  const orgEnts = new Map<string, boolean>();
  for (const r of rows) {
    if (!orgEnts.has(r.organizationId)) {
      const ent = await getPlanEntitlements(r.organizationId);
      orgEnts.set(r.organizationId, (ent?.id ?? "free") !== "free");
    }
  }

  const cards: MyGalleryCard[] = [];
  for (const r of rows) {
    if (!orgEnts.get(r.organizationId)) continue;
    const counts = await db
      .select({ n: sql<number>`count(*)` })
      .from(schema.shareGrantAssets)
      .where(eq(schema.shareGrantAssets.grantId, r.grantId));
    const favs = await db
      .select({ n: sql<number>`count(*)` })
      .from(schema.galleryFavorites)
      .where(eq(schema.galleryFavorites.grantId, r.grantId));

    // Cover = the design's cover when it's in the delivered set, else the
    // first delivered photo.
    const design = parseGalleryDesignJson(r.design);
    let coverAssetId: string | null = null;
    const members = await db
      .select({ assetId: schema.shareGrantAssets.assetId })
      .from(schema.shareGrantAssets)
      .where(eq(schema.shareGrantAssets.grantId, r.grantId))
      .orderBy(schema.shareGrantAssets.assetId)
      .limit(200);
    const inSet = new Set(members.map((m) => m.assetId));
    if (design?.cover?.assetId && inSet.has(design.cover.assetId)) coverAssetId = design.cover.assetId;
    else if (members.length) {
      const firstImage = await db
        .select({ id: schema.assets.id })
        .from(schema.assets)
        .where(and(inArray(schema.assets.id, members.map((m) => m.assetId)), eq(schema.assets.kind, "image")))
        .orderBy(schema.assets.createdAt)
        .limit(1);
      coverAssetId = firstImage[0]?.id ?? null;
    }

    const brand = JSON.parse(r.brand || "{}") as { accent?: string };
    cards.push({
      grantId: r.grantId,
      organizationId: r.organizationId,
      projectId: r.projectId,
      projectTitle: r.projectTitle,
      studioName: r.studioName ?? "your photographer",
      accent: typeof brand.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(brand.accent) ? brand.accent : "#5e6ad2",
      assetCount: counts[0]?.n ?? 0,
      favoritesCount: favs[0]?.n ?? 0,
      expiresAt: r.expiresAt ? Math.floor(r.expiresAt.getTime() / 1000) : null,
      coverAssetId,
      updatedAt: Math.floor(r.createdAt.getTime() / 1000),
    });
  }
  return cards;
}

/** Pre-open sneak peeks: flagged assets on projects whose client email
 * matches, from Studio+ orgs only (the gate). */
export async function listMyPeeks(email: string): Promise<MyPeekProject[]> {
  const db = getDb();
  const e = email.toLowerCase();
  const rows = await db
    .select({
      assetId: schema.assets.id,
      projectId: schema.projects.id,
      projectTitle: schema.projects.title,
      organizationId: schema.projects.organizationId,
      createdAt: schema.assets.createdAt,
    })
    .from(schema.assets)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.assets.projectId))
    .innerJoin(schema.clients, eq(schema.clients.id, schema.projects.clientId))
    .where(and(eq(schema.clients.email, e), eq(schema.assets.sneakPeek, true), eq(schema.assets.kind, "image")))
    .orderBy(desc(schema.assets.createdAt))
    .limit(60);

  const byProject = new Map<string, MyPeekProject & { organizationId: string }>();
  for (const r of rows) {
    const entry = byProject.get(r.projectId) ?? {
      projectId: r.projectId,
      projectTitle: r.projectTitle,
      studioName: "",
      assetIds: [],
      createdAt: Math.floor(r.createdAt.getTime() / 1000),
      organizationId: r.organizationId,
    };
    if (entry.assetIds.length < 6) entry.assetIds.push(r.assetId);
    byProject.set(r.projectId, entry);
  }

  const out: MyPeekProject[] = [];
  for (const entry of byProject.values()) {
    const ent = await getPlanEntitlements(entry.organizationId);
    if (ent?.id !== "studio" && ent?.id !== "pro") continue; // gate
    const profile = await db
      .select({ studioName: schema.studioProfiles.studioName })
      .from(schema.studioProfiles)
      .where(eq(schema.studioProfiles.organizationId, entry.organizationId))
      .limit(1);
    const { organizationId: _org, ...card } = entry;
    out.push({ ...card, studioName: profile[0]?.studioName ?? "your photographer" });
  }
  return out;
}
