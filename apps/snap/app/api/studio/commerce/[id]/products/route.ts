/* Products of one price list (WEB-179, Commerce C1 2/7) — POST creates a
 * product (kind plan-gated in lib/commerce); PUT { productIds } reorders
 * the list's products (must be the full permutation). */
import { commerceErrorStatus, createProduct, reorderProducts } from "@/lib/commerce";
import { permissionDenied } from "@/lib/permissions";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "work.manage");
  if (denied) return denied;
  const { id } = await params;
  let body: { kind?: unknown; name?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const res = await createProduct(ctx.organizationId, {
    priceListId: id,
    kind: String(body.kind ?? "") as "digital" | "print" | "package" | "custom",
    name: String(body.name ?? ""),
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
  let body: { productIds?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  if (!Array.isArray(body.productIds) || body.productIds.some((v) => typeof v !== "string")) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const res = await reorderProducts(ctx.organizationId, id, body.productIds as string[]);
  if (!res.ok) return Response.json({ error: res.error }, { status: commerceErrorStatus(res.error) });
  return Response.json({ ok: true });
}
