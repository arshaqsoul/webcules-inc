/* POST /api/integrations/v1/galleries/{id}/assets (WEB-185, Integrations 2/6).
 *
 * assets:write. Multipart publish (Lightroom's LrHttp can only POST):
 *
 *   file         — rendered photo bytes (extension classifies kind; magic
 *                  sniffing happens server-side on confirm like the browser
 *                  pipeline, whose checks this path reuses via createAsset)
 *   external_id  — the tool's stable photo id (Lightroom local catalog id)
 *   signature    — opaque edit-state hash; re-publish changes it
 *   captured_at? — epoch seconds
 *
 *   201 { assetId, externalPhotoId, created: true }   new publish
 *   200 { assetId, externalPhotoId, created: false }  re-publish (upsert)
 *   409 { error: "shared_protected" } — old version stays live (active share
 *        grant); the new bytes are kept but the old asset was not deleted
 *   400 invalid_file | invalid_external_id | invalid_signature | too_large
 *   404 { error: "gallery_not_found" } */
import {
  INTEGRATION_MAX_BYTES,
  normalizeExternalId,
  normalizeSignature,
  normalizeSource,
  publishPhoto,
} from "@/lib/integrations/publish";
import { guardIntegration } from "@/lib/integrations/http";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guardIntegration(req, "assets:write");
  if ("res" in g) return g.res;
  const { id } = await params;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "invalid_form" }, { status: 400 });
  }
  const source = normalizeSource(form.get("source"));
  if (!source) return Response.json({ error: "invalid_source" }, { status: 400 });
  const externalId = normalizeExternalId(form.get("external_id"));
  if (!externalId) {
    return Response.json({ error: "invalid_external_id" }, { status: 400 });
  }
  const signature = normalizeSignature(form.get("signature"));
  if (!signature) {
    return Response.json({ error: "invalid_signature" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size < 1) {
    return Response.json({ error: "invalid_file" }, { status: 400 });
  }
  if (file.size > INTEGRATION_MAX_BYTES) {
    return Response.json({ error: "too_large" }, { status: 400 });
  }
  const rawCaptured = form.get("captured_at");
  const capturedAt =
    typeof rawCaptured === "string" && rawCaptured.trim() !== ""
      ? Number(rawCaptured)
      : null;

  const result = await publishPhoto({
    auth: g.auth,
    projectId: id,
    source,
    externalPhotoId: externalId,
    signature,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    bytes: await file.arrayBuffer(),
    capturedAt: Number.isFinite(capturedAt) ? capturedAt : null,
  });

  if (!result.ok) {
    const status =
      result.error === "gallery_not_found"
        ? 404
        : result.error === "shared_protected"
          ? 409
          : result.error === "too_large"
            ? 400
            : 400;
    return Response.json({ error: result.error }, { status });
  }
  return Response.json(result, { status: result.created ? 201 : 200 });
}
