/* One price list (WEB-179, Commerce C1 2/7) — GET the full detail (products
 * + variants with derived markup); PATCH { name } renames, { setDefault:
 * true } makes it the studio's default list, { attachGrantId } attaches it
 * as a gallery's active list and { detachGrant: true } detaches this list
 * from its gallery (WEBC-121: the store-setup wizard's attach step). */
import {
  attachPriceListToGrant,
  commerceErrorStatus,
  detachPriceListFromGrant,
  getPriceListDetail,
  renamePriceList,
  setDefaultPriceList,
} from "@/lib/commerce";
import { permissionDenied } from "@/lib/permissions";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "work.manage");
  if (denied) return denied;
  const { id } = await params;
  const detail = await getPriceListDetail(ctx.organizationId, id);
  if (!detail) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(detail);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "work.manage");
  if (denied) return denied;
  const { id } = await params;
  let body: { name?: unknown; setDefault?: unknown; attachGrantId?: unknown; detachGrant?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  if (typeof body.attachGrantId === "string") {
    const res = await attachPriceListToGrant(ctx.organizationId, { grantId: body.attachGrantId, priceListId: id });
    if (!res.ok) return Response.json({ error: res.error }, { status: commerceErrorStatus(res.error) });
  }
  if (body.detachGrant === true) {
    const res = await detachPriceListFromGrant(ctx.organizationId, id);
    if (!res.ok) return Response.json({ error: res.error }, { status: commerceErrorStatus(res.error) });
  }
  if (body.setDefault === true) {
    const res = await setDefaultPriceList(ctx.organizationId, id);
    if (!res.ok) return Response.json({ error: res.error }, { status: commerceErrorStatus(res.error) });
  }
  if (typeof body.name === "string") {
    const res = await renamePriceList(ctx.organizationId, id, body.name);
    if (!res.ok) return Response.json({ error: res.error }, { status: commerceErrorStatus(res.error) });
  }
  return Response.json({ ok: true });
}
