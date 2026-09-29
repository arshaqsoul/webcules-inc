/* POST /api/forms/q/{token}/file (WEB-248) — public presign for a file
 * answer on a questionnaire. Scoped by the response token (link-possession
 * = authority), rate-limited per IP, ≤20 MB, Studio-plan-gated at the
 * schema level so file fields only exist on entitled studios. */
import { FORM_FILE_MAX_BYTES } from "@/lib/forms";
import { clientIp } from "@/lib/shares/gallery-auth";
import { checkFormRate, getFormResponseByToken, presignFormFile } from "@/lib/repos/forms";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let body: { filename?: unknown; bytes?: unknown; mimeType?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const response = await getFormResponseByToken(token);
  if (!response || response.submittedAt) return Response.json({ error: "not_found" }, { status: 404 });

  const ip = clientIp(req);
  if (ip && !(await checkFormRate("presign", ip))) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const result = await presignFormFile({
    organizationId: response.organizationId,
    filename: typeof body.filename === "string" ? body.filename : "",
    bytes: typeof body.bytes === "number" ? body.bytes : 0,
    mimeType: typeof body.mimeType === "string" ? body.mimeType : "application/octet-stream",
    maxBytes: FORM_FILE_MAX_BYTES,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.error === "too_large" ? 413 : 400 });
  return Response.json({ url: result.url, key: result.key, token: result.token });
}
