/* Manual rejected purge (WEB-123) — "Delete rejected now" for a project.
 * Share-guarded assets are skipped and reported in the response. */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { purgeRejectedNow } from "@/lib/repos/assets";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const result = await purgeRejectedNow({
    organizationId: ctx.organizationId,
    projectId: id,
    actorUserId: ctx.user.id,
  });
  return Response.json({ ok: true, ...result });
}
