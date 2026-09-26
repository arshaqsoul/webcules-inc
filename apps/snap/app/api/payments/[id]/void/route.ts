/* Void a manual/offline payment entry (WEB-135). Stripe rows must be
 * refunded through the refund endpoint instead. */
import { getOrgContext } from "@/lib/session";
import { voidManualPayment } from "@/lib/repos/payments";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = await voidManualPayment(ctx.organizationId, id);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.error === "not_found" ? 404 : 409 });
  }
  return Response.json({ ok: true });
}
