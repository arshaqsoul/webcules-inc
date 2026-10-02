/* WEB-320 — apply a seed gallery template to a project. Applying copies the
 * seed's design JSON with sample-photo references remapped onto the
 * project's own photos (adaptSeedToProject) — photos, entitlements and grant
 * settings are never touched, design only. Every tier may apply any seed
 * (the free-tier wow); the previous design is returned for client-side undo.
 * Customization beyond a pristine seed is the builder (Lite+, WEB-321). */
import { and, asc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";
import { getProjectGalleryDesign, saveProjectGalleryDesign } from "@/lib/repos/gallery-design";
import { adaptSeedToProject, seedTemplateOf } from "@/lib/seed-templates";
import { parseGalleryDesign } from "@/lib/gallery-design";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { key?: unknown };
  const key = typeof body.key === "string" ? body.key : "";
  const seed = seedTemplateOf(key);
  if (!seed) return Response.json({ error: "unknown_template" }, { status: 404 });

  const project = (
    await getDb()
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, id), eq(schema.projects.organizationId, ctx.organizationId)))
      .limit(1)
  )[0];
  if (!project) return Response.json({ error: "not_found" }, { status: 404 });

  // The deliverable set a fresh grant would carry, in delivery order.
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

  const previous = await getProjectGalleryDesign(ctx.organizationId, id);
  const design = adaptSeedToProject(seed, photos);
  const result = await saveProjectGalleryDesign({ organizationId: ctx.organizationId, projectId: id, design });
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });

  await getDb().insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: ctx.organizationId,
    actorType: "user",
    actorId: ctx.user.id,
    action: "project.gallery_template",
    targetType: "project",
    targetId: id,
    meta: JSON.stringify({ key: seed.key, replacedCustom: Boolean(previous) }),
  });
  return Response.json({ ok: true, previous: parseGalleryDesign(previous ?? null) });
}
