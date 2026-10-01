/* Project gallery design repository (WEB-258) — saves the validated design
 * onto the project and resolves the EFFECTIVE design a gallery renders
 * with: the project's own design wins; otherwise the org's default
 * gallery_preset applies ("new galleries start with…"); none → null (the
 * classic gallery, unchanged). */
import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "../db";
import * as schema from "../db-schema";
import { getDefaultTemplate } from "./templates";
import {
  GALLERY_DESIGN_MAX_BYTES,
  parseGalleryDesign,
  parseGalleryDesignJson,
  serializeGalleryDesign,
  type GalleryDesign,
} from "../gallery-design";

export type EffectiveDesign =
  | { design: GalleryDesign; source: "project" }
  | { design: GalleryDesign; source: "preset" }
  | { design: null; source: "none" };

export async function getProjectGalleryDesign(organizationId: string, projectId: string): Promise<GalleryDesign | null> {
  const rows = await getDb()
    .select({ galleryDesign: schema.projects.galleryDesign })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.organizationId, organizationId)))
    .limit(1);
  return parseGalleryDesignJson(rows[0]?.galleryDesign ?? null);
}

/** Strict write path (API): canonicalize + cap; a cover assetId must belong
 * to the project when present. */
export async function saveProjectGalleryDesign(params: {
  organizationId: string;
  projectId: string;
  design: GalleryDesign | null;
}): Promise<{ ok: true } | { ok: false; error: "invalid_design" | "cover_not_in_project" | "too_large" }> {
  let stored: string | null = null;
  if (params.design) {
    const canonical = parseGalleryDesign(params.design);
    if (!canonical) return { ok: false, error: "invalid_design" };
    // WEB-301: every cover surface (canonical asset + hero slider images)
    // must belong to the project — one query covers them all.
    const coverIds = [
      ...(canonical.cover?.assetId ? [canonical.cover.assetId] : []),
      ...(canonical.cover?.images ?? []).map((i) => i.assetId),
    ];
    if (coverIds.length) {
      const owned = await getDb()
        .select({ id: schema.assets.id })
        .from(schema.assets)
        .where(
          and(
            inArray(schema.assets.id, coverIds),
            eq(schema.assets.organizationId, params.organizationId),
            eq(schema.assets.projectId, params.projectId),
          ),
        );
      if (owned.length !== new Set(coverIds).size) return { ok: false, error: "cover_not_in_project" };
    }
    stored = serializeGalleryDesign(canonical);
    if (stored.length > GALLERY_DESIGN_MAX_BYTES) return { ok: false, error: "too_large" };
  }
  const updated = await getDb()
    .update(schema.projects)
    .set({ galleryDesign: stored, updatedAt: new Date() })
    .where(and(eq(schema.projects.id, params.projectId), eq(schema.projects.organizationId, params.organizationId)))
    .returning({ id: schema.projects.id });
  if (!updated.length) return { ok: false, error: "invalid_design" };
  return { ok: true };
}

/** What the public gallery renders: project design → org default preset →
 * classic. Preset inheritance is render-time: repinning the default restyles
 * galleries that haven't been individually customized. */
export async function effectiveGalleryDesign(organizationId: string, projectId: string): Promise<EffectiveDesign> {
  const [projectDesign, preset] = await Promise.all([
    getProjectGalleryDesign(organizationId, projectId),
    (async () => {
      const t = await getDefaultTemplate(organizationId, "gallery_preset");
      return t ? parseGalleryDesignJson(t.body) : null;
    })(),
  ]);
  if (projectDesign) return { design: projectDesign, source: "project" };
  if (preset) return { design: preset, source: "preset" };
  return { design: null, source: "none" };
}
