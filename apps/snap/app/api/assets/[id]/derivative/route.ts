/* Derivative upload (WEB-116) — the browser generates thumb/preview images
 * via canvas right after an upload completes and pushes them here. Small
 * (≤8MB) image-only payloads; the originals are never modified. */
import { attachDerivative } from "@/lib/repos/assets";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

const MAX_DERIVATIVE_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "expected_multipart" }, { status: 400 });
  }
  const kind = form.get("kind");
  if (kind !== "thumb" && kind !== "preview") {
    return Response.json({ error: "invalid_kind" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "missing_file" }, { status: 400 });
  if (file.size > MAX_DERIVATIVE_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
  if (!file.type.startsWith("image/")) return Response.json({ error: "unsupported_type" }, { status: 400 });

  const result = await attachDerivative({
    organizationId: ctx.organizationId,
    assetId: id,
    kind,
    bytes: await file.arrayBuffer(),
    contentType: file.type,
  });
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 400;
    return Response.json({ error: result.error }, { status });
  }
  return Response.json({ ok: true });
}
