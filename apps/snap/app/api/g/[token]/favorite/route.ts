/* Client favorite toggle — snap-g cookie auth (same gate as the gallery
 * page itself); membership re-verified server-side. */
import { resolveGalleryAccess } from "@/lib/shares/gallery-auth";
import { setFavorite, setFavoriteNote, toggleFavorite } from "@/lib/shares/selections";
import { getPlanEntitlements } from "@/lib/plans";
import { resolveGrantByToken } from "@/lib/shares/grants";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const grant = await resolveGrantByToken(token);
  const access = await resolveGalleryAccess(req.headers);
  // Same trust model as the gallery page (WEB-132): any valid verified
  // gallery session may interact; writes are scoped to THIS grant's asset
  // set by assetInGrant inside the repo calls.
  if (!grant || !access) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (grant.selectionMode === "off") return Response.json({ error: "disabled" }, { status: 409 });

  let body: { assetId?: string; favorited?: boolean; listId?: string; note?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.assetId) return Response.json({ error: "invalid_body" }, { status: 400 });

  // WEB-264: note update only (favorite must already exist).
  if (body.note !== undefined) {
    const ent = await getPlanEntitlements(grant.organizationId);
    if (ent?.id !== "studio" && ent?.id !== "pro") {
      return Response.json({ error: "notes_require_studio" }, { status: 403 });
    }
    if (!body.listId) return Response.json({ error: "invalid_body" }, { status: 400 });
    const ok = await setFavoriteNote(grant, body.assetId, body.listId, String(body.note));
    return Response.json({ ok });
  }

  // WEB-263: an explicit `favorited` is an idempotent SET (offline queue
  // replay); absent = the classic toggle. WEB-264: `listId` scopes the op.
  const listId = typeof body.listId === "string" && body.listId ? body.listId : undefined;
  const result =
    typeof body.favorited === "boolean"
      ? await setFavorite(grant, body.assetId, body.favorited, listId)
      : await toggleFavorite(grant, body.assetId, listId);
  return Response.json(result);
}
