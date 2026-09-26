/* One-click cold-storage restore for a returning studio (WEB-159). The bulk
 * STANDARD move runs in bounded daily batches on the cron; this only queues
 * it and records the request. */
import { getOrgContext } from "@/lib/session";
import { requestIaRestore } from "@/lib/dormancy";

export const dynamic = "force-dynamic";

export async function POST() {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const result = await requestIaRestore(ctx.organizationId);
  if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
  return Response.json({ ok: true, objects: result.objects });
}
