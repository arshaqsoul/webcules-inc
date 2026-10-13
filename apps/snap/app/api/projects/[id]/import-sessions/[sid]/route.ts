/* WEB-183 (Integrations 4/6) — close an import session with per-file
 * outcomes when the relayed upload queue settles. Idempotent. */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { completeImportSession } from "@/lib/repos/import-sessions";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; sid: string }> },
) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id, sid } = await params;
  const project = (
    await getDb()
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, id), eq(schema.projects.organizationId, ctx.organizationId)))
      .limit(1)
  )[0];
  if (!project) return Response.json({ error: "not_found" }, { status: 404 });

  let body: { entries?: { driveFileId: string; outcome: string }[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const closed = await completeImportSession({
    organizationId: ctx.organizationId,
    projectId: id,
    sessionId: sid,
    entries: body.entries ?? [],
  });
  if (!closed.ok) {
    const status = closed.error === "not_found" ? 404 : 400;
    return Response.json({ error: closed.error }, { status });
  }
  return Response.json({
    ok: true,
    id: closed.id,
    imported: closed.imported,
    skipped: closed.skipped,
    failed: closed.failed,
  });
}
