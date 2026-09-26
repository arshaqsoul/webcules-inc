/* Revoke a share grant — instant: the next gallery/proxy request is refused. */
import { getOrgContext } from "@/lib/session";
import { revokeShareGrant } from "@/lib/shares/grants";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const result = await revokeShareGrant({
    organizationId: ctx.organizationId,
    grantId: id,
    actorUserId: ctx.user.id,
  });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.error === "not_found" ? 404 : 409 });
  }
  return Response.json({ ok: true });
}
