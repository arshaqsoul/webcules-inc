/* WEB-183 (Integrations 4/6) — open an explicit import session for a
 * confirmed browser-relayed import (Google Drive Picker selection). The
 * client closes it with per-file outcomes when the upload queue settles
 * (PATCH on [sid]). */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { openImportSession } from "@/lib/repos/import-sessions";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  let body: { source?: string; files?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const opened = await openImportSession({
    organizationId: ctx.organizationId,
    projectId: id,
    actorUserId: ctx.user.id,
    source: body.source ?? "",
    files: body.files,
  });
  if (!opened.ok) return Response.json({ error: opened.error }, { status: 400 });
  return Response.json({ ok: true, id: opened.id });
}
