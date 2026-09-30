/* Restore / keep-hot action (WEB-153): archived RAWs move back to Standard
 * storage; hot RAWs in scope get their 6-month window renewed. */
import { z } from "zod";

import { getOrgContext } from "@/lib/session";
import { canAccessRawVault } from "@/lib/permissions";
import { getStudioProfile } from "@/lib/repos/studios";
import { claimThrottleGate } from "@/lib/system-state";
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
  // WEB-275: members only when the org opted them into the vault.
  const profile = await getStudioProfile(ctx.organizationId);
  if (!canAccessRawVault(ctx.role, profile?.memberRawAccess ?? false)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  // WEB-284: a human clicks this once — anything faster is a retry loop.
  if (!(await claimThrottleGate(`vault.restore.${ctx.organizationId}`, 60))) {
    return Response.json({ error: "too_many_requests" }, { status: 429 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });

  const result = await restoreRawAssets(ctx.organizationId, parsed.data, ctx.user.id);
  return Response.json(result, { status: result.failures.length && !result.restored && !result.extended ? 502 : 200 });
}
