/* Inbox list (WEB-304) — the SWR mount/poll endpoint. Keyset-paginated on
 * (created_at, id); filters: tab (unread/all/needs-reply/needs-triage),
 * kind, thread. Read/snooze/deleted state is per-user and never touches the
 * underlying entity. */
import { getOrgContext } from "@/lib/session";
import {
  INBOX_KINDS,
  INBOX_TABS,
  listInboxItems,
  type InboxKind,
  type InboxTab,
} from "@/lib/repos/inbox";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const tab = url.searchParams.get("tab");
  const kind = url.searchParams.get("kind");
  const threadId = url.searchParams.get("thread");
  const cursor = url.searchParams.get("cursor");
  const limitRaw = url.searchParams.get("limit");

  if (tab && !INBOX_TABS.includes(tab as InboxTab)) {
    return Response.json({ error: "invalid_tab" }, { status: 400 });
  }
  if (kind && !INBOX_KINDS.includes(kind as InboxKind)) {
    return Response.json({ error: "invalid_kind" }, { status: 400 });
  }
  // NaN-safe limit: "?limit=abc" must not reach the SQL layer.
  const limit = limitRaw === null ? undefined : Number(limitRaw);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
    return Response.json({ error: "invalid_limit" }, { status: 400 });
  }

  const { items, nextCursor } = await listInboxItems({
    userId: ctx.user.id,
    organizationId: ctx.organizationId,
    tab: (tab as InboxTab) || undefined,
    kind: (kind as InboxKind) || undefined,
    threadId: threadId || undefined,
    cursor: cursor || null,
    limit,
  });

  return Response.json({
    items: items.map((i) => ({
      id: i.id,
      kind: i.kind,
      entityType: i.entityType,
      entityId: i.entityId,
      threadId: i.threadId,
      title: i.title,
      preview: i.preview,
      readAt: i.readAt,
      snoozedUntil: i.snoozedUntil,
      createdAt: i.createdAt,
    })),
    nextCursor,
  });
}
