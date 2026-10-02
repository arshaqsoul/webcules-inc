/* RAW vault overview for the signed-in studio (WEB-153). */
import { permissionDenied } from "@/lib/permissions";
import { getOrgContext } from "@/lib/session";
import { getRawVaultSummary } from "@/lib/vault";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "rawvault.read");
  if (denied) return denied;
  const summary = await getRawVaultSummary(ctx.organizationId);
  return Response.json(summary);
}
