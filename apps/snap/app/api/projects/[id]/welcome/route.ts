/* POST /api/projects/{id}/welcome - upload a welcome collage (multipart
 * `file`, a JPEG the browser already resized to <= 2 MB). Returns the image
 * id to attach when sending a gallery (or to PUT onto an existing gallery).
 * Every plan. Unattached uploads are swept after 2 days. */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";
import { saveWelcomeImage, WELCOME_MAX_BYTES } from "@/lib/repos/welcome-image";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const project = (
    await getDb()
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, id), eq(schema.projects.organizationId, ctx.organizationId)))
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
  if (file.size > WELCOME_MAX_BYTES) return Response.json({ error: "too_large" }, { status: 413 });

  const result = await saveWelcomeImage({ organizationId: ctx.organizationId, projectId: id, bytes: await file.arrayBuffer() });
  if (!result.ok) {
    const status = result.error === "too_many_pending" ? 429 : result.error === "too_large" ? 413 : 400;
    return Response.json({ error: result.error }, { status });
  }
  return Response.json({ ok: true, imageId: result.id });
}
