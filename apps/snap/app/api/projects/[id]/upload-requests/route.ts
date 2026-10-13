/* Project client-upload links (WEB-182) — list + create. The link is the
 * public capability: /u/{token}, token shown once at create (and
 * re-displayable from the encrypted copy). */
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";
import { clientUrl } from "@/lib/client-urls";
import {
  createUploadRequest,
  effectiveFileCap,
  listProjectUploadRequests,
  listUploadRequestAssets,
} from "@/lib/shares/upload-requests";

export const dynamic = "force-dynamic";

async function projectForOrg(organizationId: string, projectId: string) {
  return (
    (await getDb()
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.organizationId, organizationId)))
      .limit(1))[0] ?? null
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await projectForOrg(ctx.organizationId, id);
  if (!project) return Response.json({ error: "not_found" }, { status: 404 });

  const requests = await listProjectUploadRequests(ctx.organizationId, id);
  const queues = await Promise.all(
    requests.map(async (r) => ({
      id: r.id,
      assets: (await listUploadRequestAssets(ctx.organizationId, r.id)).map((a) => ({
        assetId: a.assetId,
        status: a.status,
        uploaderName: a.uploaderName,
        filename: a.filename,
        kind: a.kind,
        bytes: a.bytes,
        createdAt: a.createdAt.toISOString(),
      })),
    })),
  );
  const queueBy = new Map(queues.map((q) => [q.id, q.assets]));
  return Response.json({
    requests: await Promise.all(
      requests.map(async (r) => ({
        ...r,
        fileCap: effectiveFileCap(r),
        url: r.token ? await clientUrl(ctx.organizationId, `/u/${r.token}`) : null,
        assets: queueBy.get(r.id) ?? [],
      })),
    ),
  });
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  grantId: z.string().uuid().nullable().optional(),
  expiresInDays: z.number().nullable().optional(),
  maxFiles: z.number().int().positive().max(500).nullable().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await projectForOrg(ctx.organizationId, id);
  if (!project) return Response.json({ error: "not_found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  const created = await createUploadRequest({
    organizationId: ctx.organizationId,
    projectId: id,
    title: parsed.data.title,
    grantId: parsed.data.grantId ?? null,
    expiresInDays: parsed.data.expiresInDays ?? null,
    maxFiles: parsed.data.maxFiles ?? null,
    createdById: ctx.user.id,
  });
  if (!created.ok) return Response.json({ error: created.error }, { status: 400 });
  return Response.json({
    ok: true,
    id: created.id,
    token: created.token,
    url: await clientUrl(ctx.organizationId, `/u/${created.token}`),
  });
}
