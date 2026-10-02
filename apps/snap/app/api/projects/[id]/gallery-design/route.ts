/* WEB-258: per-project gallery design (cover/layout/theme) — the designer's
 * save surface. Saving a design is Lite+ (the design layer); clearing (null)
 * is always allowed so a downgraded studio can still return to classic.
 * Presets themselves live in the template store (kind gallery_preset). */
import { z } from "zod";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";
import { getPlanEntitlements } from "@/lib/plans";
import { effectiveGalleryDesign, saveProjectGalleryDesign } from "@/lib/repos/gallery-design";
import { and, asc, eq, inArray } from "drizzle-orm";

import { designMinTier, isCoverOnlyDesign, isSeedDesign, parseGalleryDesign, serializeGalleryDesign } from "@/lib/gallery-design";
import { adaptSeedToProject, seedTemplateOf } from "@/lib/seed-templates";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = (
    await getDb()
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, id), eq(schema.projects.organizationId, ctx.organizationId)))
      .limit(1)
  )[0];
  if (!project) return Response.json({ error: "not_found" }, { status: 404 });
  const effective = await effectiveGalleryDesign(ctx.organizationId, id);
  return Response.json({ design: effective.design, source: effective.source });
}

const bodySchema = z.object({ design: z.unknown().nullable() });

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  const ent = await getPlanEntitlements(ctx.organizationId);
  let parsedDesign = parsed.data.design !== null ? parseGalleryDesign(parsed.data.design) : null;
  // SECURITY (audit P0): the `template` marker is client-controlled — a Free
  // org could forge template:"classic-wedding" onto an arbitrary custom
  // design and save it (the marker is what makes seed applications
  // free-tier-saveable). A claimed seed must be BYTE-IDENTICAL to what
  // applying that seed would produce against this project's own photos;
  // anything else is a custom design and gates as one.
  if (parsedDesign && isSeedDesign(parsedDesign)) {
    const seed = seedTemplateOf(parsedDesign.template!);
    if (seed) {
      const photos = (
        await getDb()
          .select({ id: schema.assets.id })
          .from(schema.assets)
          .where(
            and(
              eq(schema.assets.organizationId, ctx.organizationId),
              eq(schema.assets.projectId, id),
              eq(schema.assets.kind, "image"),
              inArray(schema.assets.status, ["approved", "shared"]),
            ),
          )
          .orderBy(asc(schema.assets.createdAt))
      ).map((r) => r.id);
      const pristine = parseGalleryDesign(adaptSeedToProject(seed, photos));
      if (!pristine || serializeGalleryDesign(pristine) !== serializeGalleryDesign(parsedDesign)) {
        parsedDesign = { ...parsedDesign, template: "custom" };
      }
    } else {
      parsedDesign = { ...parsedDesign, template: "custom" };
    }
  }
  // WEB-301 follow-up: Free may save a single hero/cover photo (the one
  // free design surface) — anything beyond a cover-only design stays Lite.
  if (parsed.data.design !== null && ent?.id === "free" && !isCoverOnlyDesign(parsedDesign)) {
    return Response.json({ error: "design_requires_lite", plan: ent?.id ?? "free" }, { status: 403 });
  }
  // WEB-302: hero sliders and per-breakpoint columns are Studio+ — in v1
  // (cover.images/columns) AND in v2 (a hero section's own images[] and a
  // gallery section's own columns), which previously slipped through.
  if (
    parsedDesign &&
    ent?.id !== "studio" &&
    ent?.id !== "pro" &&
    ((parsedDesign.cover?.images?.length ?? 0) >= 2 ||
      Boolean(parsedDesign.columns) ||
      (parsedDesign.sections ?? []).some(
        (s) => (s.type === "hero" && s.images.length >= 2) || (s.type === "gallery" && Boolean(s.columns)),
      ))
  ) {
    return Response.json({ error: "design_requires_studio", plan: ent?.id ?? "free" }, { status: 403 });
  }
  // WEB-320/322: v2 gate — a CUSTOM sectioned design (builder work) needs
  // Lite, and any collage section needs Studio. Pristine seed applications
  // pass above (their template marker is intact).
  if (parsedDesign && designMinTier(parsedDesign) === "studio" && ent?.id !== "studio" && ent?.id !== "pro") {
    return Response.json({ error: "design_requires_studio", plan: ent?.id ?? "free" }, { status: 403 });
  }
  if (parsedDesign && designMinTier(parsedDesign) === "lite" && ent?.id === "free") {
    return Response.json({ error: "design_requires_lite", plan: ent?.id ?? "free" }, { status: 403 });
  }

  const result = await saveProjectGalleryDesign({
    organizationId: ctx.organizationId,
    projectId: id,
    // canonical (and marker-reclassified) form — never the raw body
    design: parsedDesign,
  });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  await getDb().insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: ctx.organizationId,
    actorType: "user",
    actorId: ctx.user.id,
    action: "project.gallery_design",
    targetType: "project",
    targetId: id,
    meta: JSON.stringify({ cleared: parsed.data.design === null }),
  });
  return Response.json({ ok: true });
}
