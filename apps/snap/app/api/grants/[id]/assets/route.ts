/* The delivered set for one grant (WEB-223) — powers the expandable "what
 * was sent" grid in the Client gallery tab. Org-scoped; only ids/names/kinds
 * (thumbs stream through the authed asset proxy). */
import { getOrgContext } from "@/lib/session";
import { getShareGrant } from "@/lib/shares/grants";
import { getGrantAssets } from "@/lib/shares/grants";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const grant = await getShareGrant(ctx.organizationId, id);
  if (!grant) return Response.json({ error: "not_found" }, { status: 404 });

  const assets = await getGrantAssets(grant);
  return Response.json({
    assets: assets.map((a) => ({ id: a.id, filename: a.filename, kind: a.kind, folder: a.folder })),
  });
}
