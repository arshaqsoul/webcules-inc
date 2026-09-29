/* /api/g/{token}/lists (WEB-264) — the client's favorite lists: GET lists
 * (default created lazily) + active-list favorites; POST creates a list
 * (Lite+ per WEB-267 — lists only on Lite, notes/export on Studio);
 * DELETE ?id= removes a non-default list (its favorites go with it). */
import { resolveGalleryAccess } from "@/lib/shares/gallery-auth";
import { resolveGrantByToken } from "@/lib/shares/grants";
import { getPlanEntitlements } from "@/lib/plans";
import { createFavoriteList, deleteFavoriteList, ensureFavoriteLists, getFavoritesForList } from "@/lib/shares/selections";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const grant = await resolveGrantByToken(token);
  const access = await resolveGalleryAccess(req.headers);
  if (!grant || !access) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (grant.selectionMode === "off") return Response.json({ error: "disabled" }, { status: 409 });

  const lists = await ensureFavoriteLists(grant.id, grant.organizationId);
  const url = new URL(req.url);
  const activeId = url.searchParams.get("active");
  const active = lists.find((l) => l.id === activeId) ?? lists[0];
  const [ent, favorites] = await Promise.all([
    getPlanEntitlements(grant.organizationId),
    getFavoritesForList(grant.id, active.id),
  ]);
  return Response.json({
    lists: lists.map((l) => ({ id: l.id, name: l.name })),
    activeListId: active.id,
    favorites,
    canMakeLists: (ent?.id ?? "free") !== "free",
    canNote: ent?.id === "studio" || ent?.id === "pro",
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const grant = await resolveGrantByToken(token);
  const access = await resolveGalleryAccess(req.headers);
  if (!grant || !access) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (grant.selectionMode === "off") return Response.json({ error: "disabled" }, { status: 409 });

  const ent = await getPlanEntitlements(grant.organizationId);
  if ((ent?.id ?? "free") === "free") return Response.json({ error: "lists_require_lite" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const created = await createFavoriteList(grant, String(body.name ?? ""));
  if (!created) return Response.json({ error: "invalid_name" }, { status: 400 });
  return Response.json({ id: created.id, name: created.name });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const grant = await resolveGrantByToken(token);
  const access = await resolveGalleryAccess(req.headers);
  if (!grant || !access) return Response.json({ error: "unauthorized" }, { status: 401 });

  const ent = await getPlanEntitlements(grant.organizationId);
  if ((ent?.id ?? "free") === "free") return Response.json({ error: "lists_require_lite" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id") ?? "";
  const removed = await deleteFavoriteList(grant, id);
  if (!removed) return Response.json({ error: "cannot_delete" }, { status: 400 });
  return Response.json({ ok: true });
}
