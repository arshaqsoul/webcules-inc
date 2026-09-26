/* Studio logo upload — small branded assets go straight through the worker to
 * R2 via the org-guarded storage service (the big-media presigned pipeline is
 * Epic 7; logos are ≤512 KB by design). */
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { contentTypeForExtension, deleteObject, putObject } from "@/lib/storage/service";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

const MAX_LOGO_BYTES = 512 * 1024;

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "expected_multipart" }, { status: 400 });
  }
  const file = form.get("logo");
  if (!(file instanceof File)) return Response.json({ error: "missing_logo" }, { status: 400 });
  if (file.size > MAX_LOGO_BYTES) {
    return Response.json({ error: "logo_too_large", maxBytes: MAX_LOGO_BYTES }, { status: 400 });
  }

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const contentType = contentTypeForExtension(ext);
  if (!contentType) {
    return Response.json({ error: "unsupported_type", allowed: ["png", "jpg", "webp", "svg"] }, { status: 400 });
  }

  const db = getDb();
  const existing = (
    await db
      .select()
      .from(schema.studioProfiles)
      .where(eq(schema.studioProfiles.organizationId, ctx.organizationId))
      .limit(1)
  )[0];
  if (!existing) return Response.json({ error: "no_studio" }, { status: 404 });

  const key = await putObject(
    ctx.organizationId,
    `branding/logo-${Date.now().toString(36)}.${ext}`,
    await file.arrayBuffer(),
    contentType,
  );

  // Best-effort cleanup of a previous logo — failure is non-fatal.
  if (existing.logoKey && existing.logoKey !== key) {
    try {
      await deleteObject(ctx.organizationId, existing.logoKey);
    } catch (err) {
      console.error("old logo cleanup failed:", String(err));
    }
  }

  await db
    .update(schema.studioProfiles)
    .set({ logoKey: key, updatedAt: new Date() })
    .where(eq(schema.studioProfiles.organizationId, ctx.organizationId));

  return Response.json({ ok: true, logoKey: key });
}
