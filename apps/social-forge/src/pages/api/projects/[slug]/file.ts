import type { APIRoute } from "astro";
import fs from "node:fs";
import path from "node:path";
import { h, HttpError } from "../../../../engine/api.ts";
import { projPath } from "../../../../engine/util.ts";

const MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
  ".pdf": "application/pdf", ".json": "application/json", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8",
  ".csv": "text/csv", ".ics": "text/calendar",
};

/** Serve a file from inside a project workspace (previews, exports, swipe thumbs). */
export const GET: APIRoute = h(async ({ params, url }) => {
  const slug = params.slug!;
  const rel = url.searchParams.get("p") ?? "";
  const abs = path.resolve(projPath(slug), rel);
  if (!abs.startsWith(path.resolve(projPath(slug)))) throw new HttpError(403, "path escapes project");
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) throw new HttpError(404, `not found: ${rel}`);
  const buf = fs.readFileSync(abs);
  const ext = path.extname(abs).toLowerCase();
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": MIME[ext] ?? "application/octet-stream", "Cache-Control": "no-store" } });
});
