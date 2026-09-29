/* /api/studio/download-requests (WEB-261) — the approvals hub feed:
 * requests across the studio, optionally filtered by state. */
import { getOrgContext } from "@/lib/session";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { desc, eq, and, inArray } from "drizzle-orm";
import { isDownloadState } from "@/lib/gallery-downloads";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const stateParam = url.searchParams.get("state") ?? "requested";
  const states = stateParam
    .split(",")
    .map((s) => s.trim())
    .filter(isDownloadState);
  if (!states.length) return Response.json({ error: "invalid_state" }, { status: 400 });

  const rows = await getDb()
    .select({
      id: schema.downloadRequests.id,
      grantId: schema.downloadRequests.grantId,
      clientEmail: schema.downloadRequests.clientEmail,
      scope: schema.downloadRequests.scope,
      folderName: schema.downloadRequests.folderName,
      sizePref: schema.downloadRequests.sizePref,
      state: schema.downloadRequests.state,
      fileCount: schema.downloadRequests.fileCount,
      zipBytes: schema.downloadRequests.zipBytes,
      note: schema.downloadRequests.note,
      createdAt: schema.downloadRequests.createdAt,
      expiresAt: schema.downloadRequests.expiresAt,
      projectTitle: schema.projects.title,
    })
    .from(schema.downloadRequests)
    .innerJoin(schema.shareGrants, eq(schema.shareGrants.id, schema.downloadRequests.grantId))
    .innerJoin(schema.projects, eq(schema.projects.id, schema.shareGrants.projectId))
    .where(and(eq(schema.downloadRequests.organizationId, ctx.organizationId), inArray(schema.downloadRequests.state, states)))
    .orderBy(desc(schema.downloadRequests.createdAt))
    .limit(100);

  return Response.json({ requests: rows });
}
