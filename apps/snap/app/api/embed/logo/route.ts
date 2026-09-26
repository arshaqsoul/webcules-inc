/* Public studio logo streaming (embed-key addressed) — widgets and emails
 * fetch logos through here; the R2 object itself stays private. */
import { resolveStudioByEmbedKey } from "@/lib/embed";
import { getObject } from "@/lib/storage/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? "";
  const studio = await resolveStudioByEmbedKey(key);
  if (!studio?.logoKey) return new Response("not found", { status: 404 });

  const object = await getObject(studio.organizationId, studio.logoKey);
  if (!object) return new Response("not found", { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "image/png",
      "Cache-Control": "public, max-age=300",
      "Content-Disposition": "inline",
    },
  });
}
