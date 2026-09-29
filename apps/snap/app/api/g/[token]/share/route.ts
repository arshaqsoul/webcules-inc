/* /api/g/{token}/share (WEB-262) — mint a per-photo share link from the
 * client gallery. Guards: gallery session, asset ∈ delivered set, the
 * studio's sharing toggle, Lite+ (WEB-267 gate), and a 100/day creation
 * cap. The response URL is the /p card; the token itself lives only in
 * that URL. */
import { resolveGalleryAccess, logShareAccess } from "@/lib/shares/gallery-auth";
import { assetInGrant } from "@/lib/shares/grants";
import { createPhotoShare } from "@/lib/shares/photo-shares";
import { getPlanEntitlements } from "@/lib/plans";
import { clientUrl } from "@/lib/client-urls";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: _t } = await params;
  const access = await resolveGalleryAccess(req.headers);
  if (!access) return Response.json({ error: "unauthorized" }, { status: 401 });
  const grant = access.grant;

  if (!grant.allowSharing) return Response.json({ error: "sharing_disabled" }, { status: 403 });
  const ent = await getPlanEntitlements(grant.organizationId);
  if ((ent?.id ?? "free") === "free") return Response.json({ error: "sharing_requires_lite" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { assetId?: string };
  const assetId = String(body.assetId ?? "");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(assetId)) return Response.json({ error: "invalid_asset" }, { status: 400 });
  if (!(await assetInGrant(grant.id, assetId))) return Response.json({ error: "not_found" }, { status: 404 });

  const result = await createPhotoShare({
    organizationId: grant.organizationId,
    grantId: grant.id,
    assetId,
    grantExpiresAt: grant.expiresAt,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: 429 });

  await logShareAccess(grant.id, "share_create", req);
  const url = await clientUrl(grant.organizationId, `/p/${result.token}`);
  return Response.json({ url });
}
