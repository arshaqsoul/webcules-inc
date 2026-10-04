/* /api/grants/{id}/order - arrange the photos of a delivered gallery (every
 * plan). Live: the client sees the new order on their next load, no resend.
 *   { op: "sort", mode }                      apply a sort (inside each folder)
 *   { op: "move", ids: [...], beforeId|null } drag and drop (group move)
 * Org-scoped through the grant row. */
import { z } from "zod";

import { getOrgContext } from "@/lib/session";
import { getShareGrant } from "@/lib/shares/grants";
import { SORT_MODES } from "@/lib/gallery-order";
import { moveInGrant, sortGrant } from "@/lib/repos/gallery-order";

export const dynamic = "force-dynamic";

const bodySchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("sort"), mode: z.enum(SORT_MODES), seed: z.number().int().optional() }),
  z.object({ op: z.literal("move"), ids: z.array(z.string().uuid()).min(1).max(5000), beforeId: z.string().uuid().nullable() }),
]);

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const grant = await getShareGrant(ctx.organizationId, id);
  if (!grant) return Response.json({ error: "not_found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  if (parsed.data.op === "sort") {
    const order = await sortGrant({ grantId: grant.id, mode: parsed.data.mode, seed: parsed.data.seed });
    return Response.json({ ok: true, orderMode: parsed.data.mode, order });
  }
  const result = await moveInGrant({ grantId: grant.id, ids: parsed.data.ids, beforeId: parsed.data.beforeId });
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ ok: true, orderMode: "custom", order: result.order });
}
