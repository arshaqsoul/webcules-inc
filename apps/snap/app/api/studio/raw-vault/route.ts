/* RAW vault overview for the signed-in studio (WEB-153). */
import { canAccessRawVault } from "@/lib/permissions";
import { getOrgContext } from "@/lib/session";
import { getStudioProfile } from "@/lib/repos/studios";
import { getRawVaultSummary } from "@/lib/vault";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  // WEB-275/WEB-326: members see the vault only when the org opted them in —
  // the same gate as the panel page and the restore route (the summary API
  // used to be admin-only, which 403'd opted-in members' client refetches).
  const profile = await getStudioProfile(ctx.organizationId);
  if (!canAccessRawVault(ctx.role, profile?.memberRawAccess ?? false)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const summary = await getRawVaultSummary(ctx.organizationId);
  return Response.json(summary);
}
