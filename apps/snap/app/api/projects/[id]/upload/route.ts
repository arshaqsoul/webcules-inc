/* Media upload — worker-proxied through the R2 binding (org-validated key
 * scheme). Direct presigned multipart for multi-GB files arrives with the
 * presign story; today's cap is the Workers body limit (~100MB). */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { MAX_UPLOAD_BYTES, createAsset } from "@/lib/repos/assets";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id: projectId } = await params;

  // Project must belong to the caller's org.
  const db = getDb();
  const project = (
    await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.organizationId, ctx.organizationId)))
      .limit(1)
  )[0];
  if (!project) return Response.json({ error: "not_found" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "expected_multipart" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "missing_file" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "too_large", maxBytes: MAX_UPLOAD_BYTES }, { status: 413 });
  }
  if (!file.name) return Response.json({ error: "missing_filename" }, { status: 400 });

  const result = await createAsset({
    organizationId: ctx.organizationId,
    projectId,
    uploadedBy: ctx.user.id,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    bytes: await file.arrayBuffer(),
  });
  if ("error" in result) {
    return Response.json({ error: result.error, allowed: ["jpg", "png", "webp", "avif", "heic", "mp4", "mov", "cr2", "cr3", "nef", "arw", "dng", "rwl"] }, { status: 400 });
  }
  return Response.json({ ok: true, assetId: result.id });
}
