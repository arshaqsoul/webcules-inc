/* /api/studio/portfolio/collections/[id] (WEB-305 core) — edit / delete a
 * collection. Org-scoped twice: the route context AND the repo both filter
 * on organizationId, so a foreign collection id is a plain 404. */
import { permissionDenied } from "@/lib/permissions";
import { getOrgContext } from "@/lib/session";
import { deleteCollection, updateCollection } from "@/lib/repos/portfolio";
import { z } from "zod";

export const dynamic = "force-dynamic";

const collectionPatch = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  subtitle: z.string().trim().max(160).optional().nullable(),
  coverAssetId: z.string().optional().nullable(),
  visibility: z.enum(["public", "unlisted"]).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "work.manage");
  if (denied) return denied;
  const { id } = await params;
  let body: z.infer<typeof collectionPatch>;
  try {
    body = collectionPatch.parse(await req.json());
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const result = await updateCollection(ctx.organizationId, id, body);
  if (!result.ok) {
    return Response.json(
      { error: result.error },
      { status: result.error === "not_found" ? 404 : result.error === "not_owned" ? 403 : 400 },
    );
  }
  return Response.json({ collection: result.collection });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "work.manage");
  if (denied) return denied;
  const { id } = await params;
  const ok = await deleteCollection(ctx.organizationId, id);
  if (!ok) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}
