/* Inbox unread badge (WEB-304) — one indexed query; polled cheaply by the
 * nav (mount/focus/30s; realtime push explicitly deferred). */
import { getOrgContext } from "@/lib/session";
import { unreadInboxCount } from "@/lib/repos/inbox";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const unread = await unreadInboxCount({ userId: ctx.user.id, organizationId: ctx.organizationId });
  return Response.json({ unread });
}
