/* Price-list collection (WEB-179, Commerce C1 2/7) — GET lists the studio's
 * price lists with entitlements; POST creates one (the wizard's first
 * step). Plan gates run in lib/commerce (quotas pool across the family). */
import { commerceErrorStatus, createPriceList, listPriceLists } from "@/lib/commerce";
import { commerceGatesForPlan } from "@/lib/commerce";
import { getPlanEntitlements } from "@/lib/plans";
import { permissionDenied } from "@/lib/permissions";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "work.manage");
  if (denied) return denied;
  const ent = await getPlanEntitlements(ctx.organizationId);
  if (!ent) return Response.json({ error: "no_studio" }, { status: 404 });
  return Response.json({
    priceLists: await listPriceLists(ctx.organizationId),
    gates: commerceGatesForPlan(ent),
    plan: ent.id,
  });
}

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "work.manage");
  if (denied) return denied;
  let body: { name?: unknown; currency?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const res = await createPriceList(ctx.organizationId, {
    name: String(body.name ?? ""),
    currency: String(body.currency ?? ""),
  });
  if (!res.ok) return Response.json({ error: res.error }, { status: commerceErrorStatus(res.error) });
  return Response.json(res.value, { status: 201 });
}
