/* Client-upload link lifecycle + decisions (WEB-182): PATCH closes/reopens
 * a link; POST decides quarantined uploads (approve publishes into the
 * linked client gallery, reject reuses the culling rejection + retention). */
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";
import { decideUploadRequestAssets, setUploadRequestStatus } from "@/lib/shares/upload-requests";

export const dynamic = "force-dynamic";

async function requestInOrgProject(organizationId: string, projectId: string, rid: string) {
  return (
    (await getDb()
      .select({ id: schema.uploadRequests.id })
      .from(schema.uploadRequests)
      .where(
        and(
          eq(schema.uploadRequests.id, rid),
          eq(schema.uploadRequests.organizationId, organizationId),
          eq(schema.uploadRequests.projectId, projectId),
        ),
      )
      .limit(1))[0] ?? null
  );
}

const patchSchema = z.object({ status: z.enum(["open", "closed"]) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; rid: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id, rid } = await params;
  if (!(await requestInOrgProject(ctx.organizationId, id, rid))) return Response.json({ error: "not_found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  const ok = await setUploadRequestStatus(ctx.organizationId, rid, parsed.data.status, ctx.user.id);
  if (!ok) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}

const decideSchema = z.object({
  action: z.enum(["approve", "reject"]),
  assetIds: z.array(z.string().uuid()).min(1).max(500),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string; rid: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id, rid } = await params;
  if (!(await requestInOrgProject(ctx.organizationId, id, rid))) return Response.json({ error: "not_found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = decideSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  const result = await decideUploadRequestAssets({
    organizationId: ctx.organizationId,
    uploadRequestId: rid,
    assetIds: parsed.data.assetIds,
    action: parsed.data.action,
    actorUserId: ctx.user.id,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: 404 });
  return Response.json(result);
}
