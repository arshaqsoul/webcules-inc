/* Public brand dot for the loader — the booking-button's trigger lives on the
 * HOST page (outside any iframe), so it can't inherit the widget's CSS vars.
 * The loader fetches this tiny JSON once per mount to color the button with
 * the studio's brand accent (snippet data-snap-accent still wins). Public by
 * design: same audience as the widget and loader themselves. */
import { resolveStudioByEmbedKey, safeHexColor } from "@/lib/embed";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? "";
  const studio = await resolveStudioByEmbedKey(key);

  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    // Short cache: brand edits propagate within minutes, page loads stay cheap.
    "Cache-Control": "public, max-age=300",
    "Access-Control-Allow-Origin": "*", // the loader runs on arbitrary host pages
  });

  if (!studio) return Response.json({ error: "invalid_key" }, { status: 404, headers });

  const brand = studio.brand as { accent?: string };
  return Response.json(
    { accent: safeHexColor(brand.accent ?? "") ?? "#5e6ad2" },
    { headers },
  );
}
