/* HTTP Range streaming over R2 (WEB-260) — one implementation for every
 * media route (asset proxy, slideshow music, staff music preview): parses
 * `Range: bytes=a-b`, slices via R2 native range reads, and emits correct
 * 206/Content-Range/Accept-Ranges semantics. Scrubbing-friendly by design. */
import { getObject } from "@/lib/storage/service";

export type RangeSpec = { start: number; end: number };

/** Parse a single-range `Range` header against a known size (null = not a
 * satisfiable single range → serve the full object). */
export function parseRangeHeader(range: string | null, size: number): RangeSpec | null {
  if (!range || !size) return null;
  const match = range.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  // Suffix range ("bytes=-100" = final 100 bytes); other forms are absolute.
  if (!match[1] && match[2]) {
    const suffix = Math.min(Number(match[2]), size);
    return suffix > 0 ? { start: size - suffix, end: size - 1 } : null;
  }
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!(start <= end && start < size)) return null;
  return { start, end };
}

/** Stream an R2 object with Range support. Returns null when the object
 * itself is missing (caller decides how to 404). */
export async function serveR2Range(params: {
  organizationId: string;
  key: string;
  req: Request;
  contentType: string;
  cacheControl?: string;
}): Promise<Response | null> {
  const object = await getObject(params.organizationId, params.key);
  if (!object) return null;

  const headers = new Headers({
    "Content-Type": object.httpMetadata?.contentType ?? params.contentType,
    ...(params.cacheControl ? { "Cache-Control": params.cacheControl } : {}),
    "Accept-Ranges": "bytes",
    "Content-Disposition": "inline",
  });

  const spec = parseRangeHeader(params.req.headers.get("Range"), object.size ?? 0);
  if (spec) {
    const slice = await getObject(params.organizationId, params.key, { offset: spec.start, length: spec.end - spec.start + 1 });
    if (slice) {
      return new Response(slice.body, {
        status: 206,
        headers: {
          ...headers,
          "Content-Range": `bytes ${spec.start}-${spec.end}/${object.size}`,
          "Content-Length": String(spec.end - spec.start + 1),
        },
      });
    }
  }
  return new Response(object.body, { headers });
}
