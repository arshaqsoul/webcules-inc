/* Variants of one product (WEB-179, Commerce C1 2/7) — POST creates a
 * variant (cost/price integer cents, validated in the core); PUT
 * { variantIds } reorders the product's variants (full permutation). */
import { commerceErrorStatus, createProductVariant, reorderVariants } from "@/lib/commerce";
import { permissionDenied } from "@/lib/permissions";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "work.manage");
  if (denied) return denied;
  const { id } = await params;
  let body: { name?: unknown; costCents?: unknown; priceCents?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const res = await createProductVariant(ctx.organizationId, {
    productId: id,
    name: String(body.name ?? ""),
    costCents: Number(body.costCents ?? NaN),
    priceCents: Number(body.priceCents ?? NaN),
  });
  if (!res.ok) return Response.json({ error: res.error }, { status: commerceErrorStatus(res.error) });
  return Response.json(res.value, { status: 201 });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "work.manage");
  if (denied) return denied;
  const { id } = await params;
  let body: { variantIds?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  if (!Array.isArray(body.variantIds) || body.variantIds.some((v) => typeof v !== "string")) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const res = await reorderVariants(ctx.organizationId, id, body.variantIds as string[]);
  if (!res.ok) return Response.json({ error: res.error }, { status: commerceErrorStatus(res.error) });
  return Response.json({ ok: true });
}
