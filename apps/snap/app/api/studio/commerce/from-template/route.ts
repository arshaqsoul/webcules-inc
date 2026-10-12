/* First-run template price lists (WEB-277, Commerce C1 6/7) — one POST
 * seeds a starter list + products + variants atomically in lib/commerce.
 * Plan gates (kind filtering, family quota) run there, server-side. */
import { commerceErrorStatus, createPriceListFromTemplate } from "@/lib/commerce";
import { permissionDenied } from "@/lib/permissions";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "work.manage");
  if (denied) return denied;
  let body: { template?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const res = await createPriceListFromTemplate(ctx.organizationId, String(body.template ?? ""), ctx.user.id);
  if (!res.ok) return Response.json({ error: res.error }, { status: commerceErrorStatus(res.error) });
  return Response.json(res.value, { status: 201 });
}
