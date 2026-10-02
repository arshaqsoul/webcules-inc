/* WEB-319: public, cache-immutable serving for platform pack assets — the
 * ComfyUI sample photography templates preview against and the rendered
 * template thumbs the picker grid shows (lib/sample-pack.ts /
 * lib/template-previews.ts map the keys). No tenant data, no auth. */
import { getSystemPackObject } from "@/lib/storage/service";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", png: "image/png" };

export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const path = (key ?? []).join("/");
  const obj = await getSystemPackObject(path);
  if (!obj) return new Response("Not found", { status: 404 });
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return new Response(obj.body, {
    headers: {
      "content-type": obj.httpMetadata?.contentType ?? TYPES[ext] ?? "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
      ...(obj.httpEtag ? { etag: `"${obj.httpEtag}"` } : {}),
    },
  });
}
