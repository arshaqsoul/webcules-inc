/* One product (WEB-179, Commerce C1 2/7) — PATCH { name } renames,
 * { active: false } archives (true restores). Archived products keep their
 * rows for audit and drop out of the client store view. */
import { commerceErrorStatus, renameProduct, setProductActive } from "@/lib/commerce";
import { permissionDenied } from "@/lib/permissions";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "work.manage");
  if (denied) return denied;
  const { id } = await params;
  let body: { name?: unknown; active?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  if (typeof body.active === "boolean") {
    const res = await setProductActive(ctx.organizationId, id, body.active);
    if (!res.ok) return Response.json({ error: res.error }, { status: commerceErrorStatus(res.error) });
  }
  if (typeof body.name === "string") {
    const res = await renameProduct(ctx.organizationId, id, body.name);
    if (!res.ok) return Response.json({ error: res.error }, { status: commerceErrorStatus(res.error) });
  }
  return Response.json({ ok: true });
}
