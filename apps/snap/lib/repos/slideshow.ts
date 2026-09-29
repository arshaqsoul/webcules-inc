/* Slideshow repository (WEB-259) — the org music library (BYO tracks in R2)
 * and the per-project slideshow config. Music is Lite+ (WEB-267): the save
 * path strips a selected track for Free orgs, and the render path strips
 * again — a downgrade can never leave audio playing on a Free gallery. */
import { and, eq } from "drizzle-orm";

import { getDb } from "../db";
import * as schema from "../db-schema";
import { deleteObject } from "../storage/service";
import {
  MUSIC_MAX_BYTES,
  SLIDESHOW_MAX_JSON_BYTES,
  parseSlideshowConfig,
  parseSlideshowConfigJson,
  serializeSlideshowConfig,
  type SlideshowConfig,
} from "../slideshow";

export type SlideshowTrackRow = typeof schema.slideshowTracks.$inferSelect;

export async function listTracks(organizationId: string): Promise<SlideshowTrackRow[]> {
  return getDb()
    .select()
    .from(schema.slideshowTracks)
    .where(eq(schema.slideshowTracks.organizationId, organizationId))
    .orderBy(schema.slideshowTracks.createdAt);
}

export async function createTrack(params: {
  organizationId: string;
  name: string;
  storageKey: string;
  mimeType: string;
  bytes: number;
}): Promise<SlideshowTrackRow> {
  const row: typeof schema.slideshowTracks.$inferInsert = {
    id: crypto.randomUUID(),
    organizationId: params.organizationId,
    name: params.name.trim().slice(0, 120) || "Untitled track",
    storageKey: params.storageKey,
    mimeType: params.mimeType,
    bytes: params.bytes,
  };
  await getDb().insert(schema.slideshowTracks).values(row);
  return row as SlideshowTrackRow;
}

export async function getTrack(organizationId: string, id: string): Promise<SlideshowTrackRow | null> {
  const rows = await getDb()
    .select()
    .from(schema.slideshowTracks)
    .where(and(eq(schema.slideshowTracks.id, id), eq(schema.slideshowTracks.organizationId, organizationId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Hard delete + R2 cleanup. Galleries pointing at the track simply fall
 * back to a silent slideshow (config.music resolves to nothing). */
export async function deleteTrack(organizationId: string, id: string): Promise<boolean> {
  const track = await getTrack(organizationId, id);
  if (!track) return false;
  await getDb().delete(schema.slideshowTracks).where(eq(schema.slideshowTracks.id, id));
  try {
    await deleteObject(organizationId, track.storageKey);
  } catch (err) {
    console.error("slideshow track R2 cleanup failed:", String(err));
  }
  return true;
}

export async function getProjectSlideshow(organizationId: string, projectId: string): Promise<SlideshowConfig | null> {
  const rows = await getDb()
    .select({ gallerySlideshow: schema.projects.gallerySlideshow })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.organizationId, organizationId)))
    .limit(1);
  return parseSlideshowConfigJson(rows[0]?.gallerySlideshow ?? null);
}

/** Strict write path. Free orgs keep the basic slideshow (enabled/pace/
 * transition) but never a selected track — `music` is stripped server-side. */
export async function saveProjectSlideshow(params: {
  organizationId: string;
  projectId: string;
  config: SlideshowConfig | null;
  lite: boolean;
}): Promise<{ ok: true } | { ok: false; error: "invalid_slideshow" | "track_not_found" | "too_large" }> {
  let stored: string | null = null;
  if (params.config) {
    const canonical = parseSlideshowConfig(params.config);
    if (!canonical || !canonical.enabled) {
      // Disabled or junk → store null (no slideshow button).
      stored = null;
    } else {
      if (canonical.music) {
        const track = await getTrack(params.organizationId, canonical.music);
        if (!track) return { ok: false, error: "track_not_found" };
        if (track.bytes > MUSIC_MAX_BYTES) return { ok: false, error: "too_large" };
        // Free tier: the track validates, then stays silent (the API layer
        // also 403s the attempt — this is the belt to its braces).
        if (!params.lite) canonical.music = "";
      }
      stored = serializeSlideshowConfig(canonical);
      if (stored.length > SLIDESHOW_MAX_JSON_BYTES) return { ok: false, error: "too_large" };
    }
  }
  const updated = await getDb()
    .update(schema.projects)
    .set({ gallerySlideshow: stored, updatedAt: new Date() })
    .where(and(eq(schema.projects.id, params.projectId), eq(schema.projects.organizationId, params.organizationId)))
    .returning({ id: schema.projects.id });
  if (!updated.length) return { ok: false, error: "invalid_slideshow" };
  return { ok: true };
}

/** The effective client-facing config: Free orgs never get a track. */
export function slideshowForTier(config: SlideshowConfig | null, lite: boolean): SlideshowConfig | null {
  if (!config || !config.enabled) return null;
  return lite ? config : { ...config, music: "" };
}
