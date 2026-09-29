/* /api/myimg/{assetId} (WEB-263) — cover/peek thumbnails for the client
 * home. Auth is the remembered-device session: the email must match the
 * grant's recipient (galleries) or the project's client (sneak peeks) —
 * no cookies, no cross-client leakage. Thumb variant only. */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { resolveMySession } from "@/lib/shares/my-auth";
import { getObject } from "@/lib/storage/service";
import { getPlanEntitlements } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const grantId = url.searchParams.get("g") ?? "";
  const projectId = url.searchParams.get("p") ?? "";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return Response.json({ error: "not_found" }, { status: 404 });

  const email = await resolveMySession(req.headers);
  if (!email) return Response.json({ error: "unauthorized" }, { status: 401 });
  const e = email.toLowerCase();

  const db = getDb();
  const assetRows = await db
    .select({ organizationId: schema.assets.organizationId, projectId: schema.assets.projectId, thumbKey: schema.assets.thumbKey, storageKey: schema.assets.storageKey, peek: schema.assets.sneakPeek })
    .from(schema.assets)
    .where(eq(schema.assets.id, id))
    .limit(1);
  const asset = assetRows[0];
  if (!asset) return Response.json({ error: "not_found" }, { status: 404 });

  if (grantId) {
    const grants = await db
      .select({ clientEmail: schema.shareGrants.clientEmail })
      .from(schema.shareGrants)
      .where(and(eq(schema.shareGrants.id, grantId), eq(schema.shareGrants.status, "active")))
      .limit(1);
    if (!grants.length || grants[0].clientEmail !== e) return Response.json({ error: "not_found" }, { status: 404 });
    const inSet = await db
      .select({ assetId: schema.shareGrantAssets.assetId })
      .from(schema.shareGrantAssets)
      .where(and(eq(schema.shareGrantAssets.grantId, grantId), eq(schema.shareGrantAssets.assetId, id)))
      .limit(1);
    if (!inSet.length) return Response.json({ error: "not_found" }, { status: 404 });
  } else if (projectId) {
    // Sneak-peek path: flagged asset, project's client matches, Studio+ org.
    if (!asset.peek || asset.projectId !== projectId) return Response.json({ error: "not_found" }, { status: 404 });
    const projects = await db
      .select({ organizationId: schema.projects.organizationId, clientId: schema.projects.clientId })
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .limit(1);
    const project = projects[0];
    if (!project) return Response.json({ error: "not_found" }, { status: 404 });
    if (!project.clientId) return Response.json({ error: "not_found" }, { status: 404 });
    const client = (await db.select({ email: schema.clients.email }).from(schema.clients).where(eq(schema.clients.id, project.clientId)).limit(1))[0];
    if (!client || client.email.toLowerCase() !== e) return Response.json({ error: "not_found" }, { status: 404 });
    const ent = await getPlanEntitlements(project.organizationId);
    if (ent?.id !== "studio" && ent?.id !== "pro") return Response.json({ error: "not_found" }, { status: 404 });
  } else {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const object = await getObject(asset.organizationId, asset.thumbKey ?? asset.storageKey);
  if (!object) return Response.json({ error: "not_found" }, { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "image/jpeg",
      "Cache-Control": "private, max-age=300",
    },
  });
}
