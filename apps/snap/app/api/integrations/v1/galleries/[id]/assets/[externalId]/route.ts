/* DELETE /api/integrations/v1/galleries/{id}/assets/{externalId}
 *   ?source=lightroom   (WEB-185, Integrations 2/6)
 *
 * assets:write. Unpublish: removes the asset (the ledger row cascades).
 * 409 shared_protected when an active share grant still needs the photo —
 * the studio decides, the plugin surfaces the error.
 *
 * POST on the same path is an exact alias: Lightroom's LrHttp module cannot
 * send DELETE, and the Snap publish plugin is this route's whole reason to
 * exist. No other method semantics differ. */
import {
  normalizeExternalId,
  normalizeSource,
  unpublishPhoto,
} from "@/lib/integrations/publish";
import { guardIntegration } from "@/lib/integrations/http";

export const dynamic = "force-dynamic";

async function handle(
  req: Request,
  params: { params: Promise<{ id: string; externalId: string }> },
) {
  const g = await guardIntegration(req, "assets:write");
  if ("res" in g) return g.res;
  const { id, externalId } = await params.params;
  const source = normalizeSource(new URL(req.url).searchParams.get("source"));
  if (!source) return Response.json({ error: "invalid_source" }, { status: 400 });
  const ext = normalizeExternalId(decodeURIComponent(externalId));
  if (!ext) return Response.json({ error: "invalid_external_id" }, { status: 400 });

  const result = await unpublishPhoto({
    auth: g.auth,
    projectId: id,
    source,
    externalPhotoId: ext,
  });
  if (!result.ok) {
    const status =
      result.error === "not_found" ? 404 : result.error === "shared_protected" ? 409 : 400;
    return Response.json({ error: result.error }, { status });
  }
  return Response.json({ ok: true });
}

export const DELETE = handle;
export const POST = handle;

