/* Manual payment recording + quoted-total updates (WEB-135).
 * POST body: { action: "manual", amountMinor, method, note? } |
 *            { action: "quote", quotedTotalMinor } */
import { z } from "zod";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";
import { addManualPayment, getProjectPaymentSummary } from "@/lib/repos/payments";

export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("manual"),
    amountMinor: z.number().int().min(1).max(100_000_00),
    method: z.enum(["cash", "etransfer", "cheque", "card_offline", "other"]),
    note: z.string().max(300).optional(),
    occurredAt: z.string().datetime().optional(),
  }),
  z.object({
    action: z.literal("quote"),
    quotedTotalMinor: z.number().int().min(0).max(10_000_000_00).nullable(),
  }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });

  if (parsed.data.action === "manual") {
    const result = await addManualPayment({
      organizationId: ctx.organizationId,
      projectId: id,
      amountMinor: parsed.data.amountMinor,
      currency: "usd",
      method: parsed.data.method,
      note: parsed.data.note,
      occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : undefined,
    });
    if (!result.ok) return Response.json({ error: result.error }, { status: 404 });
  } else {
    await getDb()
      .update(schema.projects)
      .set({ quotedTotalMinor: parsed.data.quotedTotalMinor, updatedAt: new Date() })
      .where(eq(schema.projects.id, id));
  }
  return Response.json({ ok: true, summary: await getProjectPaymentSummary(ctx.organizationId, id) });
}
