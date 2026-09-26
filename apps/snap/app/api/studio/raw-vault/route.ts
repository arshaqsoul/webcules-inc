/* RAW vault overview for the signed-in studio (WEB-153). */
import { getOrgContext } from "@/lib/session";
import { getRawVaultSummary } from "@/lib/vault";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const summary = await getRawVaultSummary(ctx.organizationId);
  return Response.json(summary);
}
