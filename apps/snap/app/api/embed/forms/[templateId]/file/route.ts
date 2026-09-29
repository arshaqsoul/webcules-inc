/* POST /api/embed/forms/{templateId}/file?key=… (WEB-248) — public presign
 * for an embedded form's file answer. Authority = the embed key (same as
 * the form itself) + per-IP rate limit; schema-level Studio gating already
 * keeps file fields off lower tiers. */
import { FORM_FILE_MAX_BYTES } from "@/lib/forms";
import { resolveStudioByEmbedKey } from "@/lib/embed";
import { clientIp } from "@/lib/shares/gallery-auth";
import { checkFormRate, presignFormFile } from "@/lib/repos/forms";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ templateId: string }> }) {
  await params;
  let body: { filename?: unknown; bytes?: unknown; mimeType?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const studio = await resolveStudioByEmbedKey(new URL(req.url).searchParams.get("key") ?? "");
  if (!studio) return Response.json({ error: "invalid_key" }, { status: 404 });

  const ip = clientIp(req);
  if (ip && !(await checkFormRate("presign", ip))) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const result = await presignFormFile({
    organizationId: studio.organizationId,
    filename: typeof body.filename === "string" ? body.filename : "",
    bytes: typeof body.bytes === "number" ? body.bytes : 0,
    mimeType: typeof body.mimeType === "string" ? body.mimeType : "application/octet-stream",
    maxBytes: FORM_FILE_MAX_BYTES,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.error === "too_large" ? 413 : 400 });
  return Response.json({ url: result.url, key: result.key, token: result.token });
}
