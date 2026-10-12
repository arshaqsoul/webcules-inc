/* Lightroom publish surface (WEB-185, Integrations 2/6) — the gallery and
 * publish-ledger operations behind /api/integrations/v1/galleries.
 *
 * Vocabulary note: the integration API exposes snap *projects* as
 * "galleries" — a project is the container photos live in; sharing (client
 * links) stays a studio-side action on purpose. The plugin maps each
 * Lightroom publish collection to one gallery.
 *
 * Publish is an UPSERT keyed on (project, source, external_photo_id):
 * re-publishing a changed photo creates the new asset, replaces the ledger
 * row's pointer, and deletes the superseded asset — so bytes and curation
 * state (ratings, folders) never dangle. The ledger row is also the sync
 * source of truth: the plugin diffs its local edit signatures against
 * listPublished() to decide what Lightroom must mark "Changed". */
import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { createAsset, deleteAsset } from "@/lib/repos/assets";
import type { IntegrationAuth } from "@/lib/integrations/auth";

/** Publishing tools known to this surface (ledger `source` values). */
export const PUBLISH_SOURCES = ["lightroom"] as const;
export type PublishSource = (typeof PUBLISH_SOURCES)[number];

/** Integration uploads flow through the Worker (Lightroom cannot do the
 * presigned direct-to-R2 dance from Lua), so the worker body cap applies. */
export const INTEGRATION_MAX_BYTES = 100 * 1024 * 1024;

/** Signature: opaque to the server, capped to keep the ledger tidy. */
export const MAX_SIGNATURE_LEN = 256;
/** Lightroom local photo ids are UUID-ish strings; cap defensively. */
export const MAX_EXTERNAL_ID_LEN = 128;

export type GalleryView = {
  id: string;
  title: string;
  status: string;
  eventDate: number | null;
  createdAt: Date;
};

export type PublishedPhotoView = {
  assetId: string;
  externalPhotoId: string;
  signature: string;
  filename: string;
  updatedAt: Date;
};

/* ---------------- helpers ---------------- */

export function normalizeSource(v: unknown): PublishSource | null {
  return typeof v === "string" && (PUBLISH_SOURCES as readonly string[]).includes(v)
    ? (v as PublishSource)
    : null;
}

export function normalizeExternalId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length >= 1 && s.length <= MAX_EXTERNAL_ID_LEN ? s : null;
}

export function normalizeSignature(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length >= 1 && s.length <= MAX_SIGNATURE_LEN ? s : null;
}

export function hasScope(auth: IntegrationAuth, scope: string): boolean {
  return auth.scopes.includes(scope);
}

async function audit(
  auth: IntegrationAuth,
  action: string,
  targetType: string,
  targetId: string,
  meta: Record<string, unknown>,
): Promise<void> {
  await getDb().insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: auth.organizationId,
    actorType: "system",
    actorId: auth.tokenId,
    action,
    targetType,
    targetId,
    meta: JSON.stringify({ via: "integration_token", tokenName: auth.tokenName, ...meta }),
  });
}

/* ---------------- galleries ---------------- */

export async function listGalleries(organizationId: string): Promise<GalleryView[]> {
  const rows = await getDb()
    .select({
      id: schema.projects.id,
      title: schema.projects.title,
      status: schema.projects.status,
      eventDate: schema.projects.eventDate,
      createdAt: schema.projects.createdAt,
    })
    .from(schema.projects)
    .where(eq(schema.projects.organizationId, organizationId))
    .orderBy(desc(schema.projects.createdAt));
  return rows.map((r) => ({
    ...r,
    eventDate: r.eventDate ? Math.floor(r.eventDate.getTime() / 1000) : null,
  }));
}

export async function getGallery(
  organizationId: string,
  projectId: string,
): Promise<GalleryView | null> {
  const row = (
    await getDb()
      .select({
        id: schema.projects.id,
        title: schema.projects.title,
        status: schema.projects.status,
        eventDate: schema.projects.eventDate,
        createdAt: schema.projects.createdAt,
      })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, projectId),
          eq(schema.projects.organizationId, organizationId),
        ),
      )
      .limit(1)
  )[0];
  if (!row) return null;
  return {
    ...row,
    eventDate: row.eventDate ? Math.floor(row.eventDate.getTime() / 1000) : null,
  };
}

export async function createGallery(params: {
  organizationId: string;
  title: string;
  eventDate?: number | null;
}): Promise<GalleryView> {
  const id = crypto.randomUUID();
  await getDb().insert(schema.projects).values({
    id,
    organizationId: params.organizationId,
    title: params.title,
    status: "snapping",
    eventDate:
      typeof params.eventDate === "number" && Number.isFinite(params.eventDate)
        ? new Date(params.eventDate * 1000)
        : null,
  });
  return (await getGallery(params.organizationId, id))!;
}

/* ---------------- publish ledger ---------------- */

export async function listPublished(params: {
  organizationId: string;
  projectId: string;
  source: PublishSource;
}): Promise<PublishedPhotoView[]> {
  return (
    await getDb()
      .select({
        assetId: schema.integrationPublish.assetId,
        externalPhotoId: schema.integrationPublish.externalPhotoId,
        signature: schema.integrationPublish.signature,
        filename: schema.assets.filename,
        updatedAt: schema.integrationPublish.updatedAt,
      })
      .from(schema.integrationPublish)
      .innerJoin(
        schema.assets,
        eq(schema.assets.id, schema.integrationPublish.assetId),
      )
      .where(
        and(
          eq(schema.integrationPublish.organizationId, params.organizationId),
          eq(schema.integrationPublish.projectId, params.projectId),
          eq(schema.integrationPublish.source, params.source),
        ),
      )
      .orderBy(desc(schema.integrationPublish.updatedAt))
  ).map((r) => ({ ...r }));
}

export type PublishResult =
  | { ok: true; created: boolean; assetId: string; externalPhotoId: string }
  | {
      ok: false;
      error:
        | "unsupported_type"
        | "too_large"
        | "gallery_not_found"
        | "shared_protected";
    };

/** Publish (or re-publish) one photo: upsert keyed on
 * (project, source, external_photo_id). Re-publish replaces the superseded
 * asset unless it is protected by an active share grant — in that case the
 * old version stays live and the error names it, so the photographer can
 * decide in the studio instead of a plugin silently breaking a client
 * gallery. */
export async function publishPhoto(params: {
  auth: IntegrationAuth;
  projectId: string;
  source: PublishSource;
  externalPhotoId: string;
  signature: string;
  filename: string;
  mimeType: string;
  bytes: ArrayBuffer;
  capturedAt?: number | null;
}): Promise<PublishResult> {
  if (params.bytes.byteLength > INTEGRATION_MAX_BYTES) return { ok: false, error: "too_large" };
  const gallery = await getGallery(params.auth.organizationId, params.projectId);
  if (!gallery) return { ok: false, error: "gallery_not_found" };

  const db = getDb();
  const existing = (
    await db
      .select({
        id: schema.integrationPublish.id,
        assetId: schema.integrationPublish.assetId,
        signature: schema.integrationPublish.signature,
      })
      .from(schema.integrationPublish)
      .where(
        and(
          eq(schema.integrationPublish.projectId, params.projectId),
          eq(schema.integrationPublish.source, params.source),
          eq(schema.integrationPublish.externalPhotoId, params.externalPhotoId),
        ),
      )
      .limit(1)
  )[0];

  const created = await createAsset({
    organizationId: params.auth.organizationId,
    projectId: params.projectId,
    uploadedBy: null,
    filename: params.filename,
    mimeType: params.mimeType,
    bytes: params.bytes,
    capturedAt: params.capturedAt ?? null,
  });
  if ("error" in created) return { ok: false, error: created.error };

  if (existing) {
    // Supersede, order matters: the ledger's asset_id FK cascades on asset
    // delete, so repoint the ledger to the NEW asset first, then delete the
    // old one. A shared/protected old asset is NOT deleted — the ledger
    // already points at the new version, and the caller is told so the
    // studio can decide about the live client gallery.
    const updated = await db
      .update(schema.integrationPublish)
      .set({
        assetId: created.id,
        signature: params.signature,
        tokenId: params.auth.tokenId,
        updatedAt: new Date(),
      })
      .where(eq(schema.integrationPublish.id, existing.id))
      .returning({ id: schema.integrationPublish.id });

    if (updated.length === 0) {
      // The old asset (and, via cascade, the ledger row) vanished between
      // the read above and now — publish as a fresh row instead.
      await db.insert(schema.integrationPublish).values({
        id: crypto.randomUUID(),
        organizationId: params.auth.organizationId,
        projectId: params.projectId,
        assetId: created.id,
        source: params.source,
        externalPhotoId: params.externalPhotoId,
        signature: params.signature,
        tokenId: params.auth.tokenId,
      });
      await audit(params.auth, "integration.publish", "project", params.projectId, {
        source: params.source,
        externalPhotoId: params.externalPhotoId,
        assetId: created.id,
      });
      return {
        ok: true,
        created: true,
        assetId: created.id,
        externalPhotoId: params.externalPhotoId,
      };
    }

    const del = await deleteAsset(params.auth.organizationId, existing.assetId);
    await audit(
      params.auth,
      del.ok ? "integration.republish" : "integration.republish_protected",
      "project",
      params.projectId,
      {
        source: params.source,
        externalPhotoId: params.externalPhotoId,
        oldAssetId: existing.assetId,
        newAssetId: created.id,
      },
    );
    if (!del.ok && del.error === "shared_protected") {
      return { ok: false, error: "shared_protected" };
    }
    return { ok: true, created: false, assetId: created.id, externalPhotoId: params.externalPhotoId };
  }

  await db.insert(schema.integrationPublish).values({
    id: crypto.randomUUID(),
    organizationId: params.auth.organizationId,
    projectId: params.projectId,
    assetId: created.id,
    source: params.source,
    externalPhotoId: params.externalPhotoId,
    signature: params.signature,
    tokenId: params.auth.tokenId,
  });
  await audit(params.auth, "integration.publish", "project", params.projectId, {
    source: params.source,
    externalPhotoId: params.externalPhotoId,
    assetId: created.id,
  });
  return { ok: true, created: true, assetId: created.id, externalPhotoId: params.externalPhotoId };
}

export type UnpublishResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "shared_protected" };

/** Remove a published photo: deletes the asset (cascade clears the ledger
 * row) unless an active share grant protects it — same guard, same reason. */
export async function unpublishPhoto(params: {
  auth: IntegrationAuth;
  projectId: string;
  source: PublishSource;
  externalPhotoId: string;
}): Promise<UnpublishResult> {
  const db = getDb();
  const row = (
    await db
      .select({ assetId: schema.integrationPublish.assetId })
      .from(schema.integrationPublish)
      .where(
        and(
          eq(schema.integrationPublish.organizationId, params.auth.organizationId),
          eq(schema.integrationPublish.projectId, params.projectId),
          eq(schema.integrationPublish.source, params.source),
          eq(schema.integrationPublish.externalPhotoId, params.externalPhotoId),
        ),
      )
      .limit(1)
  )[0];
  if (!row) return { ok: false, error: "not_found" };

  const del = await deleteAsset(params.auth.organizationId, row.assetId);
  if (!del.ok) return del;
  await audit(params.auth, "integration.unpublish", "project", params.projectId, {
    source: params.source,
    externalPhotoId: params.externalPhotoId,
    assetId: row.assetId,
  });
  return { ok: true };
}
