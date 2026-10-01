/* WEB-258: per-project gallery design (cover/layout/theme) — the designer's
 * save surface. Saving a design is Lite+ (the design layer); clearing (null)
 * is always allowed so a downgraded studio can still return to classic.
 * Presets themselves live in the template store (kind gallery_preset). */
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";
import { getPlanEntitlements } from "@/lib/plans";
import { effectiveGalleryDesign, saveProjectGalleryDesign } from "@/lib/repos/gallery-design";
import { isCoverOnlyDesign, parseGalleryDesign, type GalleryDesign } from "@/lib/gallery-design";

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
  const parsedDesign =
    parsed.data.design !== null ? parseGalleryDesign(parsed.data.design) : null;
  // WEB-301 follow-up: Free may save a single hero/cover photo (the one
  // free design surface) — anything beyond a cover-only design stays Lite.
  if (parsed.data.design !== null && ent?.id === "free" && !isCoverOnlyDesign(parsedDesign)) {
    return Response.json({ error: "design_requires_lite", plan: ent?.id ?? "free" }, { status: 403 });
  }
  // WEB-302: hero slider (2+ ordered cover images) and per-breakpoint columns
  // are Studio+ — the designer gates this in the UI; the API must agree.
  // (parseGalleryDesign drops slider arrays below 2 images, so a single photo
  // is a plain cover and passes here on every plan.)
  if (
    parsedDesign &&
    ent?.id !== "studio" &&
    ent?.id !== "pro" &&
    ((parsedDesign.cover?.images?.length ?? 0) >= 2 || Boolean(parsedDesign.columns))
  ) {
    return Response.json({ error: "design_requires_studio", plan: ent?.id ?? "free" }, { status: 403 });
  }

  const result = await saveProjectGalleryDesign({
    organizationId: ctx.organizationId,
    projectId: id,
    design: (parsed.data.design as GalleryDesign | null) ?? null,
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
