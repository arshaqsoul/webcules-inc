/* /api/assets/sneak-peek (WEB-263) — bulk flag assets as sneak peeks; a
 * first look for the client home before the gallery opens. Studio+ gate
 * (WEB-267: sneak peeks are a Studio feature). */
import { z } from "zod";

import { getOrgContext } from "@/lib/session";
import { getPlanEntitlements } from "@/lib/plans";
import { setSneakPeek } from "@/lib/repos/assets";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  assetIds: z.array(z.string().min(1).max(64)).min(1).max(500),
  on: z.boolean(),
});

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  const ent = await getPlanEntitlements(ctx.organizationId);
  if (ent?.id !== "studio" && ent?.id !== "pro") {
    return Response.json({ error: "sneak_peeks_require_studio" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  const n = await setSneakPeek({ organizationId: ctx.organizationId, assetIds: parsed.data.assetIds, on: parsed.data.on });
  return Response.json({ ok: true, updated: n });
}
