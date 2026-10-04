/* The delivered set for one grant (WEB-223) - powers the expandable "what
 * was sent" grid and the Arrange view. In gallery order, with the facts the
 * sorts use. Org-scoped; only ids/names/kinds (thumbs stream through the
 * authed asset proxy). */
import { getOrgContext } from "@/lib/session";
import { getShareGrant } from "@/lib/shares/grants";
import { getGrantOrder } from "@/lib/repos/gallery-order";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const grant = await getShareGrant(ctx.organizationId, id);
  if (!grant) return Response.json({ error: "not_found" }, { status: 404 });

  const assets = await getGrantOrder(grant.id);
  return Response.json({
    orderMode: grant.orderMode,
    projectId: grant.projectId,
    assets: assets.map((a) => ({
      id: a.id,
      filename: a.filename,
      kind: a.kind,
      folder: a.folder,
      colorKey: a.colorKey,
      capturedAt: a.capturedAtSec && a.capturedAtSec > 0 ? a.capturedAtSec : null,
    })),
  });
}
