/* GET /api/studio/forms/file?key=… (WEB-248) — serve a form-file answer to
 * staff. The key must live under this org's form-files prefix (minted by
 * presignFormFile); no token needed because staff session = authority. */
import { getOrgContext } from "@/lib/session";
import { getObject } from "@/lib/storage/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!key.startsWith(`${ctx.organizationId}/form-files/`) || key.includes("..")) {
    return Response.json({ error: "invalid_key" }, { status: 400 });
  }
  const object = await getObject(ctx.organizationId, key);
  if (!object) return Response.json({ error: "not_found" }, { status: 404 });
  const name = key.split("/").pop() ?? "file";
  const filename = encodeURIComponent(name);
  return new Response(object.body as ReadableStream, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
