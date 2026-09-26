/* Restore / keep-hot action (WEB-153): archived RAWs move back to Standard
 * storage; hot RAWs in scope get their 6-month window renewed. */
import { z } from "zod";

import { getOrgContext } from "@/lib/session";
import { restoreRawAssets } from "@/lib/vault";

export const dynamic = "force-dynamic";

const Body = z.object({
  assetIds: z.array(z.string().uuid()).max(500).optional(),
  projectId: z.string().uuid().optional(),
  all: z.boolean().optional(),
});

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });

  const result = await restoreRawAssets(ctx.organizationId, parsed.data, ctx.user.id);
  return Response.json(result, { status: result.failures.length && !result.restored && !result.extended ? 502 : 200 });
}
