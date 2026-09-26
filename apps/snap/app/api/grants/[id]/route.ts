/* Grant lifecycle — expiry edit (PATCH). Revocation/regeneration live in
 * their own action routes. */
import { getOrgContext } from "@/lib/session";
import { getShareGrant, normalizeExpiry, setShareGrantExpiry } from "@/lib/shares/grants";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  let body: { expiresInDays?: number | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const expiry = normalizeExpiry(body.expiresInDays ?? null);
  if (!expiry.ok) return Response.json({ error: "invalid_expiry" }, { status: 400 });

  const result = await setShareGrantExpiry({
    organizationId: ctx.organizationId,
    grantId: id,
    expiresAt: expiry.expiresAt,
    actorUserId: ctx.user.id,
  });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.error === "not_found" ? 404 : 409 });
  }
  return Response.json({ ok: true });
}
