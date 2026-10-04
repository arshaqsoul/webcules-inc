/* Welcome collage storage + attachment. One small JPEG per image row; a
 * gallery points at it via share_grant.welcome_image_id. Every operation is
 * org-scoped, and a gallery can only point at an image from its own project. */
import { and, eq, lt, sql } from "drizzle-orm";

import { getDb } from "../db";
import * as schema from "../db-schema";
import { stripJpegExif } from "../exif";
import { deleteObject, putObject } from "../storage/service";
import { clientUrl } from "../client-urls";
import { welcomeLink } from "../welcome-link";

export const WELCOME_MAX_BYTES = 2 * 1024 * 1024;
/** Uploaded-but-unattached images one studio may hold at once. */
const MAX_UNATTACHED = 20;
/** Grace before an unreferenced image is swept (covers upload → send). */
const ORPHAN_GRACE_SECONDS = 2 * 24 * 3600;

export type WelcomeError = "empty" | "too_large" | "not_jpeg" | "too_many_pending";

/** Validate + store a collage. Re-encoded by the browser, but never trusted:
 * JPEG magic, size cap, and any EXIF/GPS is stripped. */
export async function saveWelcomeImage(params: {
  organizationId: string;
  projectId: string;
  bytes: ArrayBuffer;
}): Promise<{ ok: true; id: string } | { ok: false; error: WelcomeError }> {
  const { bytes } = params;
  if (bytes.byteLength === 0) return { ok: false, error: "empty" };
  if (bytes.byteLength > WELCOME_MAX_BYTES) return { ok: false, error: "too_large" };
  const head = new Uint8Array(bytes, 0, Math.min(3, bytes.byteLength));
  if (head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) return { ok: false, error: "not_jpeg" };

  const db = getDb();
  const pending = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.welcomeImages)
    .where(
      and(
        eq(schema.welcomeImages.organizationId, params.organizationId),
        sql`NOT EXISTS (SELECT 1 FROM share_grant g WHERE g.welcome_image_id = ${schema.welcomeImages.id})`,
      ),
    );
  if ((pending[0]?.n ?? 0) >= MAX_UNATTACHED) return { ok: false, error: "too_many_pending" };

  const stripped = stripJpegExif(bytes);
  const clean = stripped ? (stripped.buffer.slice(stripped.byteOffset, stripped.byteOffset + stripped.byteLength) as ArrayBuffer) : bytes;
  const id = crypto.randomUUID();
  const key = await putObject(params.organizationId, `welcome/${params.projectId}/${id}.jpg`, clean, "image/jpeg");
  await db.insert(schema.welcomeImages).values({
    id,
    organizationId: params.organizationId,
    projectId: params.projectId,
    r2Key: key,
    bytes: clean.byteLength,
  });
  return { ok: true, id };
}

async function referencedElsewhere(imageId: string, exceptGrantId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: schema.shareGrants.id })
    .from(schema.shareGrants)
    .where(and(eq(schema.shareGrants.welcomeImageId, imageId), sql`${schema.shareGrants.id} <> ${exceptGrantId}`))
    .limit(1);
  return rows.length > 0;
}

async function deleteImage(row: { id: string; organizationId: string; r2Key: string }): Promise<void> {
  try {
    await deleteObject(row.organizationId, row.r2Key);
  } catch (err) {
    console.error("welcome image delete failed:", String(err));
  }
  await getDb().delete(schema.welcomeImages).where(eq(schema.welcomeImages.id, row.id));
}

/** Point a gallery at an uploaded image (replacing - and, if nothing else
 * uses it, deleting - the previous one). Proofing galleries never take a
 * collage: it would carry clean, unwatermarked photos into a public email. */
export async function attachWelcomeImage(params: {
  organizationId: string;
  grantId: string;
  imageId: string;
  /** Show the image as the first thing on the gallery (email is unconditional). */
  banner?: boolean;
}): Promise<{ ok: true } | { ok: false; error: "not_found" | "proofing" | "wrong_project" }> {
  const db = getDb();
  const grant = (
    await db
      .select()
      .from(schema.shareGrants)
      .where(and(eq(schema.shareGrants.id, params.grantId), eq(schema.shareGrants.organizationId, params.organizationId)))
      .limit(1)
  )[0];
  const image = (
    await db
      .select()
      .from(schema.welcomeImages)
      .where(and(eq(schema.welcomeImages.id, params.imageId), eq(schema.welcomeImages.organizationId, params.organizationId)))
      .limit(1)
  )[0];
  if (!grant || !image) return { ok: false, error: "not_found" };
  if (grant.proofing) return { ok: false, error: "proofing" };
  if (image.projectId !== grant.projectId) return { ok: false, error: "wrong_project" };

  const previousId = grant.welcomeImageId;
  await db
    .update(schema.shareGrants)
    .set({ welcomeImageId: image.id, ...(params.banner !== undefined ? { welcomeBanner: params.banner } : {}) })
    .where(eq(schema.shareGrants.id, grant.id));
  if (previousId && previousId !== image.id && !(await referencedElsewhere(previousId, grant.id))) {
    const old = (await db.select().from(schema.welcomeImages).where(eq(schema.welcomeImages.id, previousId)).limit(1))[0];
    if (old) await deleteImage(old);
  }
  return { ok: true };
}

/** Toggle the gallery banner without touching the attached image. */
export async function setWelcomeBanner(params: { organizationId: string; grantId: string; banner: boolean }): Promise<void> {
  await getDb()
    .update(schema.shareGrants)
    .set({ welcomeBanner: params.banner })
    .where(and(eq(schema.shareGrants.id, params.grantId), eq(schema.shareGrants.organizationId, params.organizationId)));
}

/** Detach (and delete, if unused elsewhere) a gallery's collage. */
export async function removeWelcomeImage(params: { organizationId: string; grantId: string }): Promise<boolean> {
  const db = getDb();
  const grant = (
    await db
      .select()
      .from(schema.shareGrants)
      .where(and(eq(schema.shareGrants.id, params.grantId), eq(schema.shareGrants.organizationId, params.organizationId)))
      .limit(1)
  )[0];
  if (!grant?.welcomeImageId) return false;
  const imageId = grant.welcomeImageId;
  await db.update(schema.shareGrants).set({ welcomeImageId: null }).where(eq(schema.shareGrants.id, grant.id));
  if (!(await referencedElsewhere(imageId, grant.id))) {
    const row = (await db.select().from(schema.welcomeImages).where(eq(schema.welcomeImages.id, imageId)).limit(1))[0];
    if (row) await deleteImage(row);
  }
  return true;
}

/** Absolute signed URL for a gallery's collage (email + gallery header), or null. */
export async function welcomeImageUrlFor(organizationId: string, grant: { welcomeImageId: string | null }): Promise<string | null> {
  if (!grant.welcomeImageId) return null;
  return clientUrl(organizationId, await welcomeLink(grant.welcomeImageId));
}

/** Resolve an image for the public route: the signature was checked by the
 * caller; here a LIVE gallery must still reference it. */
export async function liveWelcomeImage(imageId: string): Promise<{ organizationId: string; r2Key: string } | null> {
  const db = getDb();
  const image = (await db.select().from(schema.welcomeImages).where(eq(schema.welcomeImages.id, imageId)).limit(1))[0];
  if (!image) return null;
  const grants = await db
    .select({ status: schema.shareGrants.status, expiresAt: schema.shareGrants.expiresAt })
    .from(schema.shareGrants)
    .where(eq(schema.shareGrants.welcomeImageId, imageId));
  const live = grants.some((g) => g.status === "active" && (!g.expiresAt || g.expiresAt.getTime() > Date.now()));
  return live ? { organizationId: image.organizationId, r2Key: image.r2Key } : null;
}

/** Daily sweep: images nothing references (never sent, or their gallery was
 * deleted) past the grace period. Bounded per run. */
export async function sweepOrphanWelcomeImages(limit = 50): Promise<number> {
  const db = getDb();
  const cutoff = new Date(Date.now() - ORPHAN_GRACE_SECONDS * 1000);
  const orphans = await db
    .select({ id: schema.welcomeImages.id, organizationId: schema.welcomeImages.organizationId, r2Key: schema.welcomeImages.r2Key })
    .from(schema.welcomeImages)
    .where(
      and(
        lt(schema.welcomeImages.createdAt, cutoff),
        sql`NOT EXISTS (SELECT 1 FROM share_grant g WHERE g.welcome_image_id = ${schema.welcomeImages.id})`,
      ),
    )
    .limit(limit);
  for (const row of orphans) await deleteImage(row);
  return orphans.length;
}
