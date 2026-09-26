/* Re-send the SAME link (decrypts token_enc). Only for effectively-active
 * grants — a dead link is never re-emailed; regenerate instead. */
import { getOrgContext } from "@/lib/session";
import { getGrantAssets, getGrantToken, getShareGrant } from "@/lib/shares/grants";
import { sendGrantEmail } from "@/lib/shares/notify";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const grant = await getShareGrant(ctx.organizationId, id);
  if (!grant) return Response.json({ error: "not_found" }, { status: 404 });

  const token = await getGrantToken(grant);
  if (!token) return Response.json({ error: "link_dead_regenerate" }, { status: 409 });

  const assets = await getGrantAssets(grant);
  const galleryUrl = `${new URL(_req.url).origin}/g/${token}`;
  const emailed = await sendGrantEmail({
    organizationId: ctx.organizationId,
    clientEmail: grant.clientEmail,
    clientName: grant.clientEmail.split("@")[0],
    galleryUrl,
    photoCount: assets.length,
    expiresAt: grant.expiresAt,
    grantId: grant.id,
    fresh: false,
  });

  return Response.json({ ok: true, emailed });
}
