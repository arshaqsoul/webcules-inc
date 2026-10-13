/* /api/integrations/v1/galleries (WEB-185, Integrations 2/6).
 *
 *   GET  (galleries:read)  — list the studio's galleries (snap projects)
 *   POST (galleries:write) — create a gallery { title, eventDate? }
 *
 * The Lightroom plugin maps each publish collection to one gallery; sharing
 * stays a studio-side action. */
import {
  createGallery,
  listGalleries,
} from "@/lib/integrations/publish";
import { guardIntegration } from "@/lib/integrations/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guardIntegration(req, "galleries:read");
  if ("res" in g) return g.res;
  const galleries = await listGalleries(g.auth.organizationId);
  return Response.json({
    galleries: galleries.map((x) => ({
      id: x.id,
      title: x.title,
      status: x.status,
      eventDate: x.eventDate,
      createdAt: Math.floor(x.createdAt.getTime() / 1000),
    })),
  });
}

export async function POST(req: Request) {
  const g = await guardIntegration(req, "galleries:write");
  if ("res" in g) return g.res;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const { title, eventDate } = (body ?? {}) as { title?: unknown; eventDate?: unknown };
  if (typeof title !== "string" || title.trim().length < 1 || title.trim().length > 120) {
    return Response.json({ error: "invalid_title" }, { status: 400 });
  }
  const gallery = await createGallery({
    organizationId: g.auth.organizationId,
    title: title.trim(),
    eventDate:
      typeof eventDate === "number" && Number.isFinite(eventDate) ? eventDate : null,
  });
  return Response.json(
    {
      gallery: {
        id: gallery.id,
        title: gallery.title,
        status: gallery.status,
        eventDate: gallery.eventDate,
        createdAt: Math.floor(gallery.createdAt.getTime() / 1000),
      },
    },
    { status: 201 },
  );
}
