/* Refund a payment (staff). Creates the Stripe refund (with pipeline-stage
 * and dispute guards in the repo); the charge.refunded webhook finalizes the
 * ledger row, cancels the booking + project, and emails the client.
 * Body (optional): { contentPolicy: "keep" | "delete_now" } — delete_now
 * revokes live galleries and deletes the project's files at refund time. */
import { getOrgContext } from "@/lib/session";
import { refundPayment } from "@/lib/repos/payments";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = (await req.json().catch(() => ({}))) as { contentPolicy?: string };
  const contentPolicy = body.contentPolicy === "delete_now" ? ("delete_now" as const) : ("keep" as const);

  const result = await refundPayment(ctx.organizationId, id, ctx.user.id, { contentPolicy });
  if (!result.ok) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "already_refunded" || result.error === "project_stage_blocked" || result.error === "dispute_frozen"
          ? 409
          : 400;
    return Response.json({ error: result.error }, { status });
  }
  return Response.json({ ok: true });
}
