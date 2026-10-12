/* One variant (WEB-179, Commerce C1 2/7) — PATCH { name?, costCents?,
 * priceCents?, active? }. Omitted price fields keep their stored value; the
 * merged pair is re-validated so a partial edit can't go invalid. */
import { commerceErrorStatus, setVariantActive, updateProductVariant } from "@/lib/commerce";
import { permissionDenied } from "@/lib/permissions";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "work.manage");
  if (denied) return denied;
  const { id } = await params;
  let body: { name?: unknown; costCents?: unknown; priceCents?: unknown; active?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  if (typeof body.active === "boolean") {
    const res = await setVariantActive(ctx.organizationId, id, body.active);
    if (!res.ok) return Response.json({ error: res.error }, { status: commerceErrorStatus(res.error) });
  }
  if (body.name !== undefined || body.costCents !== undefined || body.priceCents !== undefined) {
    const res = await updateProductVariant(ctx.organizationId, {
      variantId: id,
      name: body.name === undefined ? undefined : String(body.name),
      costCents: body.costCents === undefined ? undefined : Number(body.costCents),
      priceCents: body.priceCents === undefined ? undefined : Number(body.priceCents),
    });
    if (!res.ok) return Response.json({ error: res.error }, { status: commerceErrorStatus(res.error) });
  }
  return Response.json({ ok: true });
}
