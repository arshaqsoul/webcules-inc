/* /api/g/{token}/download/{id} (WEB-261) — fetch a built ZIP. Auth is the
 * gallery session (no long-lived raw URLs); the archive must be `ready`
 * and inside its 7-day TTL. First fetch flips `delivered` and logs a
 * zip_download event (never consumes the per-photo cap). */
import { eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { resolveGalleryAccess, clientIp, logShareAccess } from "@/lib/shares/gallery-auth";
import { getObject } from "@/lib/storage/service";
import { getDownloadRequestForGrant, markDownloadState } from "@/lib/repos/downloads";
import { resolveGrantByToken } from "@/lib/shares/grants";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const tokenGrant = await resolveGrantByToken(token);
  if (!tokenGrant) return Response.json({ error: "unknown_gallery" }, { status: 404 });
  const access = await resolveGalleryAccess(req.headers, tokenGrant.id);
  if (!access) return Response.json({ error: "unauthorized" }, { status: 401 });
  const grant = access.grant;

  const request = await getDownloadRequestForGrant(grant.id, id);
  if (!request || !request.zipKey) return Response.json({ error: "not_found" }, { status: 404 });
  if (request.state !== "ready" && request.state !== "delivered") return Response.json({ error: "not_ready" }, { status: 409 });
  if (request.expiresAt && request.expiresAt < Math.floor(Date.now() / 1000)) {
    await markDownloadState(request.id, "expired");
    return Response.json({ error: "expired" }, { status: 410 });
  }

  const object = await getObject(grant.organizationId, request.zipKey);
  if (!object) return Response.json({ error: "not_found" }, { status: 404 });

  const db = getDb();
  await db
    .update(schema.downloadRequests)
    .set({ downloadCount: sql`${schema.downloadRequests.downloadCount} + 1` })
    .where(eq(schema.downloadRequests.id, request.id));
  if (request.state === "ready") {
    await markDownloadState(request.id, "delivered");
  }
  await logShareAccess(grant.id, "zip_download", req);

  return new Response(object.body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="photos.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
