/* WEB-259: per-project slideshow config (basic = Free, music = Lite+).
 * Mirrors the gallery-design route: org-guarded, canonicalized by the repo,
 * audit-surfaced. */
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";
import { getPlanEntitlements } from "@/lib/plans";
import { getProjectSlideshow, saveProjectSlideshow } from "@/lib/repos/slideshow";

export const dynamic = "force-dynamic";

async function ownedProject(organizationId: string, id: string) {
  return (
    await getDb()
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, id), eq(schema.projects.organizationId, organizationId)))
      .limit(1)
  )[0];
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await ownedProject(ctx.organizationId, id))) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ slideshow: await getProjectSlideshow(ctx.organizationId, id) });
}

const bodySchema = z.object({ slideshow: z.unknown().nullable() });

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  const ent = await getPlanEntitlements(ctx.organizationId);
  const lite = (ent?.id ?? "free") !== "free";
  const raw = (parsed.data.slideshow ?? null) as Record<string, unknown> | null;
  if (raw && raw.enabled === true && raw.music && !lite) {
    return Response.json({ error: "music_requires_lite" }, { status: 403 });
  }

  const result = await saveProjectSlideshow({
    organizationId: ctx.organizationId,
    projectId: id,
    config: (parsed.data.slideshow ?? null) as never,
    lite,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });

  await getDb().insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: ctx.organizationId,
    actorType: "user",
    actorId: ctx.user.id,
    action: "project.slideshow",
    targetType: "project",
    targetId: id,
    meta: JSON.stringify({ cleared: parsed.data.slideshow === null || raw?.enabled !== true }),
  });
  return Response.json({ ok: true });
}
