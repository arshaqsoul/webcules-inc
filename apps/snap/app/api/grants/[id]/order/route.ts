/* PUT /api/grants/{id}/order - save the arrangement of a delivered gallery
 * (every plan). Called ONCE per Arrange session (Done): sorting and dragging
 * happen in the browser, and this writes only the photos that moved. Live:
 * the client sees the new order on their next load, no resend.
 *   { ids: [...every photo, in the final order], mode }
 * Org-scoped through the grant row. */
import { z } from "zod";

import { getOrgContext } from "@/lib/session";
import { getShareGrant } from "@/lib/shares/grants";
import { SORT_MODES } from "@/lib/gallery-order";
import { setGrantOrder } from "@/lib/repos/gallery-order";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(20000),
  mode: z.enum([...SORT_MODES, "custom"]),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const grant = await getShareGrant(ctx.organizationId, id);
  if (!grant) return Response.json({ error: "not_found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  const result = await setGrantOrder({ grantId: grant.id, ids: parsed.data.ids, mode: parsed.data.mode, currentMode: grant.orderMode });
  if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
  return Response.json({ ok: true, orderMode: parsed.data.mode, order: parsed.data.ids, written: result.written });
}
