/* Folder rename / delete (WEB-216) — org-scoped; delete drops assets back to
 * Unfiled (pointers only) and never touches delivered gallery snapshots. */
import { deleteFolder, renameFolder } from "@/lib/repos/folders";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; folderId: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { folderId } = await params;

  let body: { name?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const result = await renameFolder({
    organizationId: ctx.organizationId,
    folderId,
    name: body.name ?? "",
    actorUserId: ctx.user.id,
  });
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : result.error === "invalid_name" ? 400 : 409;
    return Response.json({ error: result.error }, { status });
  }
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; folderId: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { folderId } = await params;

  const result = await deleteFolder({
    organizationId: ctx.organizationId,
    folderId,
    actorUserId: ctx.user.id,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: 404 });
  return Response.json({ ok: true });
}
