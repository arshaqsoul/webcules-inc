/* POST /api/uploads (WEB-111) — mint a presigned direct-to-R2 upload session.
 * ≤100MB → single presigned PUT (300s TTL, content-type pinned); >100MB →
 * presigned multipart (CreateMultipartUpload server-side, part URLs for the
 * declared size). Asset row is only written on confirm. */
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { DIRECT_MAX_BYTES, createUploadSession } from "@/lib/uploads";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  projectId: z.string().uuid(),
  filename: z.string().trim().min(1).max(255),
  bytes: z.number().int().min(1).max(DIRECT_MAX_BYTES),
  mimeType: z.string().trim().max(120).default("application/octet-stream"),
});

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  // Project must belong to the caller's org.
  const { projectId } = parsed.data;
  const project = (
    await getDb()
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.organizationId, ctx.organizationId)))
      .limit(1)
  )[0];
  if (!project) return Response.json({ error: "not_found" }, { status: 404 });

  const result = await createUploadSession({
    organizationId: ctx.organizationId,
    projectId,
    uploadedBy: ctx.user.id,
    filename: parsed.data.filename,
    mimeType: parsed.data.mimeType,
    bytes: parsed.data.bytes,
  });
  if (!result.ok) {
    return Response.json(
      { error: result.error, allowed: result.error === "unsupported_type" ? ["jpg", "png", "webp", "avif", "heic", "mp4", "mov", "cr2", "cr3", "nef", "arw", "dng", "rwl"] : undefined, ...result.extra },
      { status: result.status },
    );
  }

  return Response.json({
    ok: true,
    assetId: result.session.id,
    mode: result.session.mode,
    url: result.presigned.url || undefined,
    headers: result.presigned.contentType ? { "Content-Type": result.presigned.contentType } : undefined,
    partSize: result.partSize,
    partUrls: result.partUrls,
  });
}
