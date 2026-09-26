/* Regenerate — mints a new token, kills the old grant immediately, and
 * emails the fresh link to the grant's client email. Expiry carries over
 * unless the request provides a new one (null = never expires). */
import { getOrgContext } from "@/lib/session";
import { getGrantAssets, getShareGrant, normalizeExpiry, regenerateShareGrant } from "@/lib/shares/grants";
import { sendGrantEmail } from "@/lib/shares/notify";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  let body: { expiresInDays?: number | null } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch { /* empty body allowed */ }

  let expiresAt: Date | null | undefined = undefined; // undefined = carry over
  if (body.expiresInDays !== undefined) {
    const expiry = normalizeExpiry(body.expiresInDays);
    if (!expiry.ok) return Response.json({ error: "invalid_expiry" }, { status: 400 });
    expiresAt = expiry.expiresAt;
  }

  const result = await regenerateShareGrant({
    organizationId: ctx.organizationId,
    grantId: id,
    expiresAt,
    actorUserId: ctx.user.id,
  });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.error === "not_found" ? 404 : 409 });
  }

  const grant = await getShareGrant(ctx.organizationId, result.grantId);
  const assets = grant ? await getGrantAssets(grant) : [];

  const galleryUrl = `${new URL(req.url).origin}/g/${result.token}`;
  const emailed = await sendGrantEmail({
    organizationId: ctx.organizationId,
    clientEmail: grant?.clientEmail ?? "",
    clientName: (grant?.clientEmail ?? "").split("@")[0],
    galleryUrl,
    photoCount: assets.length,
    expiresAt: grant?.expiresAt ?? null,
    grantId: result.grantId,
    fresh: true,
  });

  return Response.json({ ok: true, grantId: result.grantId, url: galleryUrl, emailed });
}
