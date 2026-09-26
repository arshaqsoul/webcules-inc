/* Public widget brand resolution — embedKey → studio brand (name, accent,
 * logo URL). Keys are public identifiers; this exposes nothing private. */
import { resolveStudioByEmbedKey } from "@/lib/embed";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? "";
  const studio = await resolveStudioByEmbedKey(key);
  if (!studio) return Response.json({ error: "invalid_key" }, { status: 404 });

  return Response.json(
    {
      studioName: studio.studioName,
      accent: studio.brand.accent ?? null,
      logoUrl: studio.logoKey ? `/api/embed/logo?key=${studio.embedKey}` : null,
    },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
