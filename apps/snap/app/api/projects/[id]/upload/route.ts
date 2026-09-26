/* Media upload — worker-proxied through the R2 binding (org-validated key
 * scheme). Direct presigned multipart for multi-GB files arrives with the
 * presign story; today's cap is the Workers body limit (~100MB).
 * Plan gates (WEB-148/151): storage hard-lock at 2× included bytes, free-tier
 * JPG-only, monthly upload-byte bound (2× cap), 250k file cap — every error
 * carries usage + the plan so the UI can upsell. */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { MAX_UPLOAD_BYTES, classifyUpload, createAsset } from "@/lib/repos/assets";
import { getPlanEntitlements } from "@/lib/plans";
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

  /* ---------------- Plan gates ---------------- */
  const ent = await getPlanEntitlements(ctx.organizationId);
  if (ent) {
    const classified = classifyUpload(file.name);
    const usage = {
      storageUsedBytes: ent.storageUsedBytes,
      storageCapBytes: ent.storageBytes,
      hardLockBytes: ent.hardLockBytes,
      monthUploadBytes: ent.monthUploadBytes,
      fileCount: ent.fileCount,
      plan: ent.id,
    };

    // Free tier: JPG/PNG-style images only; RAW is Lite+.
    if ((ent.jpgOnly || !ent.rawAllowed) && classified && classified.kind !== "image" && classified.kind !== "other") {
      return Response.json(
        { error: "plan_type_restricted", kind: classified.kind, ...usage },
        { status: 403 },
      );
    }

    // Hard lock at 2× included bytes — the overage zone ends here.
    if (ent.storageUsedBytes + file.size > ent.hardLockBytes || ent.atHardLock) {
      return Response.json({ error: "storage_locked", ...usage }, { status: 413 });
    }

    // Monthly PUT churn bound (2× tier cap).
    if (ent.monthUploadBytes + file.size > ent.monthlyUploadBytes) {
      return Response.json({ error: "upload_rate_bound", ...usage }, { status: 429 });
    }

    // Org file ceiling.
    if (ent.fileCount >= ent.fileCap) {
      return Response.json({ error: "file_cap", ...usage }, { status: 413 });
    }
  }

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
