/* GET /api/integrations/v1/galleries/{id} (WEB-185, Integrations 2/6).
 *
 * galleries:read. One gallery plus its published-photo ledger for a source
 * (?source=lightroom) — the re-publish sync feed: the plugin diffs these
 * signatures against its local edit state to decide what is "Changed".
 *
 *   200 { gallery, published: [{ assetId, externalPhotoId, signature, filename, updatedAt }] }
 *   400 { error: "invalid_source" } · 404 { error: "not_found" } */
import {
  getGallery,
  listPublished,
  normalizeSource,
} from "@/lib/integrations/publish";
import { guardIntegration } from "@/lib/integrations/http";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guardIntegration(req, "galleries:read");
  if ("res" in g) return g.res;
  const { id } = await params;
  const url = new URL(req.url);
  const source = normalizeSource(url.searchParams.get("source"));
  if (!source) {
    return Response.json({ error: "invalid_source" }, { status: 400 });
  }
  const gallery = await getGallery(g.auth.organizationId, id);
  if (!gallery) return Response.json({ error: "not_found" }, { status: 404 });
  const published = await listPublished({
    organizationId: g.auth.organizationId,
    projectId: id,
    source,
  });
  return Response.json({
    gallery: {
      id: gallery.id,
      title: gallery.title,
      status: gallery.status,
      eventDate: gallery.eventDate,
      createdAt: Math.floor(gallery.createdAt.getTime() / 1000),
    },
    published: published.map((p) => ({
      assetId: p.assetId,
      externalPhotoId: p.externalPhotoId,
      signature: p.signature,
      filename: p.filename,
      updatedAt: Math.floor(p.updatedAt.getTime() / 1000),
    })),
  });
}
