/* Near-duplicate regroup (WEB-401) — re-clusters a project's hashed images
 * by dHash distance and rewrites group_cover. Called after uploads settle
 * and from the Files "Group similar" action. Idempotent (full rewrite). */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { clusterProjectAssets } from "@/lib/repos/assets";
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

  const result = await clusterProjectAssets(ctx.organizationId, id);
  return Response.json(result);
}
