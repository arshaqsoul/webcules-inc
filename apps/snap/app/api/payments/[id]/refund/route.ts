/* Refund a payment (staff). Creates the Stripe refund; the charge.refunded
 * webhook finalizes the ledger row and cancels the booking. */
import { getOrgContext } from "@/lib/session";
import { refundPayment } from "@/lib/repos/payments";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const result = await refundPayment(ctx.organizationId, id, ctx.user.id);
  if (!result.ok) {
    const status =
      result.error === "not_found" ? 404 : result.error === "already_refunded" ? 409 : 400;
    return Response.json({ error: result.error }, { status });
  }
  return Response.json({ ok: true });
}
