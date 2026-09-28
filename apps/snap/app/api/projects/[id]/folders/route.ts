/* Project folders (WEB-216) — list with counts + create. */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { createFolder, listFolders } from "@/lib/repos/folders";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

async function projectForOrg(organizationId: string, projectId: string) {
  return (
    (await getDb()
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.organizationId, organizationId)))
      .limit(1)) [0] ?? null
  );
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await projectForOrg(ctx.organizationId, id);
  if (!project) return Response.json({ error: "not_found" }, { status: 404 });

  // Approved/shared counts when the picker asks (folder-level delivery).
  const wantDeliverable = new URL(req.url).searchParams.get("deliverable") === "1";
  const { folders, unfiledCount } = await listFolders(ctx.organizationId, id, {
    statuses: wantDeliverable ? ["approved", "shared"] : undefined,
  });
  return Response.json({ folders, unfiledCount });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await projectForOrg(ctx.organizationId, id);
  if (!project) return Response.json({ error: "not_found" }, { status: 404 });

  let body: { name?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const created = await createFolder({
    organizationId: ctx.organizationId,
    projectId: id,
    name: body.name ?? "",
    actorUserId: ctx.user.id,
  });
  if (!created.ok) {
    const status = created.error === "invalid_name" ? 400 : created.error === "too_many" ? 402 : 409;
    return Response.json({ error: created.error }, { status });
  }
  return Response.json({ ok: true, id: created.id, name: created.name });
}
