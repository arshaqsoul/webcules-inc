/* Inbox unread badge (WEB-304) — one indexed query; polled cheaply by the
 * nav (mount/focus/30s; realtime push explicitly deferred). WEB-442: also the
 * home of the dormancy activity touch, lifted off getOrgContext's read path —
 * this poll is client-driven (never blocks a render) and fires on dashboard
 * mount, so staff activity still resets pending purge cycles, while the
 * hourly guard in the UPDATE itself keeps it to ≤1 write per studio per hour. */
import { getOrgContext, touchStudioActivity } from "@/lib/session";
import { unreadInboxCount } from "@/lib/repos/inbox";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const unread = await unreadInboxCount({ userId: ctx.user.id, organizationId: ctx.organizationId });
  await touchStudioActivity(ctx.organizationId);
  return Response.json({ unread });
}
