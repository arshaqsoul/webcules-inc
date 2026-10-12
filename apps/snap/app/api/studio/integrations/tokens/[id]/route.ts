/* Revoke an integration token (WEB-186, 1/6) — soft delete, org-scoped
 * through getOrgContext like the other /api/studio routes. Revocation is
 * immediate: the bearer lookup ignores revoked rows. */
import { permissionDenied } from "@/lib/permissions";
import { getOrgContext } from "@/lib/session";
import { revokeIntegrationToken } from "@/lib/integrations/tokens";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "settings.write");
  if (denied) return denied;
  const { id } = await params;
  const ok = await revokeIntegrationToken(ctx.organizationId, id);
  if (!ok) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}
