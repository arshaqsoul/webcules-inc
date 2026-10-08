/* Inbox repository (WEB-304) — every inbox/thread query lives here (tenant
 * discipline: route handlers never touch drizzle directly). The inbox is a
 * per-user view (Linear model): read/snooze/delete mutate inbox_item rows
 * only — the underlying entity is never touched. Listing is keyset-paginated
 * on (created_at, id) — OFFSET pagination breaks the moment an item mints
 * mid-scroll; the cursor does not. */
import { and, asc, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { emailAddress } from "@/lib/hosts";

/** Linear's open-notification cap — pruned oldest-first by the daily cron. */
export const INBOX_OPEN_CAP = 2000;

export const INBOX_KINDS = ["email", "booking", "contract", "invoice", "gallery", "order", "lead"] as const;
export type InboxKind = (typeof INBOX_KINDS)[number];

export const INBOX_TABS = ["unread", "all", "needs-reply", "needs-triage"] as const;
export type InboxTab = (typeof INBOX_TABS)[number];

export type InboxItemRow = typeof schema.inboxItems.$inferSelect;

/* ---------------- Threads ---------------- */

/** Most-recent thread for a client email, created on first sight. Two
 * same-second emits can race the SELECT and mint two threads for one email —
 * harmless (both carry the conversation; resolution picks the newest) and
 * rare; the spec deliberately keeps threads non-unique per client. */
export async function resolveOrCreateThread(params: {
  organizationId: string;
  clientEmail: string;
  subject?: string | null;
  clientId?: string | null;
  leadId?: string | null;
  projectId?: string | null;
}): Promise<string> {
  const db = getDb();
  const email = params.clientEmail.toLowerCase();
  const existing = (
    await db
      .select({ id: schema.threads.id })
      .from(schema.threads)
      .where(and(eq(schema.threads.organizationId, params.organizationId), eq(schema.threads.clientEmail, email)))
      .orderBy(desc(schema.threads.lastActivityAt))
      .limit(1)
  )[0];
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await db.insert(schema.threads).values({
    id,
    organizationId: params.organizationId,
    clientEmail: email,
    subject: params.subject?.slice(0, 300) ?? "",
    clientId: params.clientId ?? null,
    leadId: params.leadId ?? null,
    projectId: params.projectId ?? null,
  });
  return id;
}

/** Append a message and bump the thread's activity pointer (the newest
 * direction drives the needs-reply tab). rfc_message_id UNIQUE collapses
 * webhook-retry duplicates — the insert is skipped when one already exists.
 * textPreview carries the FULL body text (≤8 KB, stripped) until WEB-307
 * moves bodies to R2; list surfaces truncate to their own preview caps. */
export async function appendThreadMessage(params: {
  organizationId: string;
  threadId: string;
  direction: "in" | "out";
  rfcMessageId?: string | null;
  inReplyTo?: string | null;
  referencesChain?: string | null;
  fromAddr?: string;
  subject?: string;
  textPreview?: string;
  /** WEB-307: R2 keys for the sanitized HTML body + raw .eml. */
  htmlR2Key?: string | null;
  rawR2Key?: string | null;
  hasAttachments?: boolean;
  status?: "received" | "sent" | "failed";
  createdAt?: Date;
}): Promise<string | null> {
  const db = getDb();
  const id = crypto.randomUUID();
  try {
    await db.batch([
      db.insert(schema.threadMessages).values({
        id,
        threadId: params.threadId,
        organizationId: params.organizationId,
        direction: params.direction,
        rfcMessageId: params.rfcMessageId || null,
        inReplyTo: params.inReplyTo ?? null,
        referencesChain: params.referencesChain ?? null,
        fromAddr: params.fromAddr ?? "",
        subject: params.subject?.slice(0, 300) ?? "",
        textPreview: (params.textPreview ?? "").slice(0, 8000),
        htmlR2Key: params.htmlR2Key ?? null,
        rawR2Key: params.rawR2Key ?? null,
        hasAttachments: params.hasAttachments ?? false,
        status: params.status ?? (params.direction === "out" ? "sent" : "received"),
        ...(params.createdAt ? { createdAt: params.createdAt } : {}),
      }),
      db
        .update(schema.threads)
        .set({
          lastDirection: params.direction,
          lastActivityAt: params.createdAt ?? new Date(),
        })
        .where(eq(schema.threads.id, params.threadId)),
    ]);
  } catch (err) {
    if (String(err).includes("UNIQUE")) return null; // duplicate Message-ID
    throw err;
  }
  return id;
}

export async function getThreadWithMessages(organizationId: string, threadId: string) {
  const db = getDb();
  const thread = (
    await db
      .select()
      .from(schema.threads)
      .where(and(eq(schema.threads.id, threadId), eq(schema.threads.organizationId, organizationId)))
      .limit(1)
  )[0];
  if (!thread) return null;
  const messages = await db
    .select()
    .from(schema.threadMessages)
    .where(eq(schema.threadMessages.threadId, threadId))
    .orderBy(asc(schema.threadMessages.createdAt));
  return { thread, messages };
}

/* ---------------- Minting ---------------- */

/** Fan an event out to one inbox_item per org member. Identity is
 * (user, entity_type, entity_id) among OPEN items: a refire (webhook retry)
 * collapses, and a NEW event on the same entity bumps the item — unread
 * again, latest title/preview, back at the top of the stream. Deleted items
 * fall out of the partial index, so a genuinely new event mints fresh.
 * Never throws — minting is auxiliary to the domain write behind it. */
export async function mintInboxItems(event: {
  organizationId: string;
  kind: InboxKind;
  entityType: string;
  entityId: string;
  threadId?: string | null;
  title: string;
  preview?: string;
  occurredAt?: Date;
}): Promise<number> {
  try {
    const db = getDb();
    const members = await db
      .select({ userId: schema.member.userId })
      .from(schema.member)
      .where(eq(schema.member.organizationId, event.organizationId));
    if (members.length === 0) return 0;
    const createdAt = event.occurredAt ?? new Date();
    const rows = members.map((m) => ({
      id: crypto.randomUUID(),
      userId: m.userId,
      organizationId: event.organizationId,
      kind: event.kind,
      entityType: event.entityType,
      entityId: event.entityId,
      threadId: event.threadId ?? null,
      title: event.title.slice(0, 200),
      preview: (event.preview ?? "").slice(0, 300),
      createdAt,
    }));
    const out = await db
      .insert(schema.inboxItems)
      .values(rows)
      .onConflictDoUpdate({
        target: [schema.inboxItems.userId, schema.inboxItems.entityType, schema.inboxItems.entityId],
        targetWhere: sql`${schema.inboxItems.deletedAt} IS NULL`,
        set: {
          kind: sql`excluded.kind`,
          title: sql`excluded.title`,
          preview: sql`excluded.preview`,
          threadId: sql`excluded.thread_id`,
          createdAt: sql`excluded.created_at`,
          readAt: null,
          snoozedUntil: null,
        },
      })
      .returning({ id: schema.inboxItems.id });
    return out.length;
  } catch (err) {
    console.error("inbox mint failed:", String(err));
    return 0;
  }
}

/* ---------------- Listing (keyset) ---------------- */

const CURSOR_SEP = ":";

/** base64url without Node Buffer (workerd has none) — TextEncoder covers
 * non-ASCII ids; epoch + uuid cursors are the common path. */
function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeInboxCursor(item: { createdAt: Date; id: string }): string {
  return toBase64Url(`${Math.floor(item.createdAt.getTime() / 1000)}${CURSOR_SEP}${item.id}`);
}

export function decodeInboxCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const [sec, id] = fromBase64Url(cursor).split(CURSOR_SEP);
    const t = Number(sec);
    if (!Number.isInteger(t) || t <= 0 || !id) return null;
    return { createdAt: new Date(t * 1000), id };
  } catch {
    return null;
  }
}

export type ListInboxParams = {
  userId: string;
  organizationId: string;
  tab?: InboxTab;
  kind?: InboxKind;
  threadId?: string;
  /** Substring search over title/preview (v1 LIKE; D1 FTS5 is confirmed
   * available — when the corpus demands it, promote to an external-content
   * FTS5 table over inbox_item and keep this signature unchanged). */
  q?: string | null;
  cursor?: string | null;
  limit?: number;
  /** Snoozed items leave the list until snoozed_until passes (Linear
   * semantics); the unread count hides them the same way. */
  includeSnoozed?: boolean;
};

export async function listInboxItems(params: ListInboxParams): Promise<{
  items: InboxItemRow[];
  nextCursor: string | null;
}> {
  const db = getDb();
  const rawLimit = params.limit ?? 25;
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 25;
  const nowSec = Math.floor(Date.now() / 1000);

  const conds = [
    eq(schema.inboxItems.userId, params.userId),
    eq(schema.inboxItems.organizationId, params.organizationId),
    isNull(schema.inboxItems.deletedAt),
  ];
  if (params.tab === "unread") conds.push(isNull(schema.inboxItems.readAt));
  if (params.kind) conds.push(eq(schema.inboxItems.kind, params.kind));
  if (params.threadId) conds.push(eq(schema.inboxItems.threadId, params.threadId));
  if (params.tab === "needs-reply") {
    // Awaiting the studio: the newest message on the thread is the client's.
    conds.push(eq(schema.threads.lastDirection, "in"));
  }
  if (params.tab === "needs-triage") conds.push(isNull(schema.inboxItems.threadId));
  if (params.q?.trim()) {
    // LIKE escape: %/_ in the needle must not widen the match.
    const needle = `%${params.q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const search = or(
      sql`${schema.inboxItems.title} LIKE ${needle} ESCAPE '\\'`,
      sql`${schema.inboxItems.preview} LIKE ${needle} ESCAPE '\\'`,
    );
    if (search) conds.push(search);
  }
  if (!params.includeSnoozed) {
    const snoozeGate = or(isNull(schema.inboxItems.snoozedUntil), lt(schema.inboxItems.snoozedUntil, nowSec));
    if (snoozeGate) conds.push(snoozeGate);
  }
  if (params.cursor) {
    const c = decodeInboxCursor(params.cursor);
    if (!c) return { items: [], nextCursor: null };
    const cursorCond = or(
      lt(schema.inboxItems.createdAt, c.createdAt),
      and(eq(schema.inboxItems.createdAt, c.createdAt), lt(schema.inboxItems.id, c.id)),
    );
    if (cursorCond) conds.push(cursorCond);
  }

  const rows = await db
    .select()
    .from(schema.inboxItems)
    .leftJoin(schema.threads, eq(schema.threads.id, schema.inboxItems.threadId))
    .where(and(...conds))
    .orderBy(desc(schema.inboxItems.createdAt), desc(schema.inboxItems.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map((r) => r.inbox_item);
  return {
    items,
    nextCursor: hasMore && items.length > 0 ? encodeInboxCursor(items[items.length - 1]) : null,
  };
}

/** The nav badge — deliberately one indexed query ((user_id, read_at)). */
export async function unreadInboxCount(params: { userId: string; organizationId: string }): Promise<number> {
  const rows = await getDb()
    .select({ n: sql<number>`count(*)` })
    .from(schema.inboxItems)
    .where(
      and(
        eq(schema.inboxItems.userId, params.userId),
        eq(schema.inboxItems.organizationId, params.organizationId),
        isNull(schema.inboxItems.deletedAt),
        isNull(schema.inboxItems.readAt),
        or(isNull(schema.inboxItems.snoozedUntil), lt(schema.inboxItems.snoozedUntil, Math.floor(Date.now() / 1000))),
      ),
    );
  return Number(rows[0]?.n ?? 0);
}

/* ---------------- Per-user state transitions ---------------- */

export async function getInboxItem(organizationId: string, userId: string, itemId: string): Promise<InboxItemRow | null> {
  const row = (
    await getDb()
      .select()
      .from(schema.inboxItems)
      .where(
        and(
          eq(schema.inboxItems.id, itemId),
          eq(schema.inboxItems.userId, userId),
          eq(schema.inboxItems.organizationId, organizationId),
        ),
      )
      .limit(1)
  )[0];
  return row ?? null;
}

export type InboxItemAction =
  | { action: "read" }
  | { action: "unread" }
  | { action: "snooze"; until: Date }
  | { action: "unsnooze" }
  | { action: "delete" }
  | { action: "restore" };

export async function applyInboxItemAction(
  organizationId: string,
  userId: string,
  itemId: string,
  action: InboxItemAction,
): Promise<InboxItemRow | null> {
  const db = getDb();
  const set: Partial<typeof schema.inboxItems.$inferInsert> = {};
  switch (action.action) {
    case "read":
      set.readAt = Math.floor(Date.now() / 1000);
      break;
    case "unread":
      set.readAt = null;
      break;
    case "snooze":
      set.snoozedUntil = Math.floor(action.until.getTime() / 1000);
      break;
    case "unsnooze":
      set.snoozedUntil = null;
      break;
    case "delete":
      set.deletedAt = Math.floor(Date.now() / 1000);
      break;
    case "restore":
      set.deletedAt = null;
      set.readAt = null;
      break;
  }
  const out = await db
    .update(schema.inboxItems)
    .set(set)
    .where(
      and(
        eq(schema.inboxItems.id, itemId),
        eq(schema.inboxItems.userId, userId),
        eq(schema.inboxItems.organizationId, organizationId),
      ),
    )
    .returning();
  return out[0] ?? null;
}

export async function markAllInboxRead(params: { userId: string; organizationId: string }): Promise<number> {
  const out = await getDb()
    .update(schema.inboxItems)
    .set({ readAt: Math.floor(Date.now() / 1000) })
    .where(
      and(
        eq(schema.inboxItems.userId, params.userId),
        eq(schema.inboxItems.organizationId, params.organizationId),
        isNull(schema.inboxItems.deletedAt),
        isNull(schema.inboxItems.readAt),
      ),
    )
    .returning({ id: schema.inboxItems.id });
  return out.length;
}

/** WEB-305: opening a conversation marks its items read (Linear's
 * open-notification-is-read). Scoped to the caller's own rows. */
export async function markThreadItemsRead(params: {
  userId: string;
  organizationId: string;
  threadId: string;
}): Promise<number> {
  const out = await getDb()
    .update(schema.inboxItems)
    .set({ readAt: Math.floor(Date.now() / 1000) })
    .where(
      and(
        eq(schema.inboxItems.userId, params.userId),
        eq(schema.inboxItems.organizationId, params.organizationId),
        eq(schema.inboxItems.threadId, params.threadId),
        isNull(schema.inboxItems.deletedAt),
        isNull(schema.inboxItems.readAt),
      ),
    )
    .returning({ id: schema.inboxItems.id });
  return out.length;
}

/** WEB-305: the caller's items on one thread (event cards + read state). */
export async function listThreadItems(params: { userId: string; organizationId: string; threadId: string }) {
  return getDb()
    .select()
    .from(schema.inboxItems)
    .where(
      and(
        eq(schema.inboxItems.userId, params.userId),
        eq(schema.inboxItems.organizationId, params.organizationId),
        eq(schema.inboxItems.threadId, params.threadId),
        isNull(schema.inboxItems.deletedAt),
      ),
    )
    .orderBy(desc(schema.inboxItems.createdAt));
}

/** WEB-308: attach a threadless (triage) item to a client/lead/project —
 * resolves (or creates) the record's conversation, re-points the item, and
 * retitles it to the record. Returns the thread to open. */
export async function attachTriageItem(params: {
  userId: string;
  organizationId: string;
  itemId: string;
  kind: "lead" | "client" | "project";
  recordId: string;
}): Promise<{ ok: true; threadId: string; title: string } | { ok: false; error: "item_not_found" | "already_threaded" | "record_not_found" }> {
  const db = getDb();
  const item = (
    await db
      .select()
      .from(schema.inboxItems)
      .where(
        and(
          eq(schema.inboxItems.id, params.itemId),
          eq(schema.inboxItems.userId, params.userId),
          eq(schema.inboxItems.organizationId, params.organizationId),
          isNull(schema.inboxItems.deletedAt),
        ),
      )
      .limit(1)
  )[0];
  if (!item) return { ok: false, error: "item_not_found" };
  if (item.threadId) return { ok: false, error: "already_threaded" };

  let clientEmail: string;
  let title: string;
  let leadId: string | null = null;
  let clientId: string | null = null;
  let projectId: string | null = null;
  if (params.kind === "lead") {
    const lead = (
      await db
        .select()
        .from(schema.leads)
        .where(and(eq(schema.leads.id, params.recordId), eq(schema.leads.organizationId, params.organizationId)))
        .limit(1)
    )[0];
    if (!lead) return { ok: false, error: "record_not_found" };
    clientEmail = lead.email;
    title = `New inquiry — ${lead.name}`;
    leadId = lead.id;
  } else if (params.kind === "client") {
    const client = (
      await db
        .select()
        .from(schema.clients)
        .where(and(eq(schema.clients.id, params.recordId), eq(schema.clients.organizationId, params.organizationId)))
        .limit(1)
    )[0];
    if (!client) return { ok: false, error: "record_not_found" };
    clientEmail = client.email;
    title = `Conversation — ${client.name ?? client.email}`;
    clientId = client.id;
  } else {
    const project = (
      await db
        .select()
        .from(schema.projects)
        .where(and(eq(schema.projects.id, params.recordId), eq(schema.projects.organizationId, params.organizationId)))
        .limit(1)
    )[0];
    if (!project) return { ok: false, error: "record_not_found" };
    const client = project.clientId
      ? (await db.select().from(schema.clients).where(eq(schema.clients.id, project.clientId)).limit(1))[0]
      : undefined;
    clientEmail = client?.email ?? emailAddress("unknown");
    title = `Conversation — ${project.title}`;
    projectId = project.id;
  }

  const threadId = await resolveOrCreateThread({
    organizationId: params.organizationId,
    clientEmail,
    subject: item.title,
    clientId,
    leadId,
    projectId,
  });
  await db
    .update(schema.inboxItems)
    .set({ threadId, title })
    .where(eq(schema.inboxItems.id, item.id));
  return { ok: true, threadId, title };
}

export async function deleteReadInboxItems(params: { userId: string; organizationId: string }): Promise<number> {
  const out = await getDb()
    .update(schema.inboxItems)
    .set({ deletedAt: Math.floor(Date.now() / 1000) })
    .where(
      and(
        eq(schema.inboxItems.userId, params.userId),
        eq(schema.inboxItems.organizationId, params.organizationId),
        isNull(schema.inboxItems.deletedAt),
        sql`${schema.inboxItems.readAt} IS NOT NULL`,
      ),
    )
    .returning({ id: schema.inboxItems.id });
  return out.length;
}

/* ---------------- 2,000-open-items cap (daily cron) ---------------- */

/** Prune every user's open items down to `cap` (oldest first). Soft-deletes —
 * consistent with manual deletes, and the rows fall out of every index. */
export async function pruneInboxCaps(cap = INBOX_OPEN_CAP): Promise<{ users: number; pruned: number }> {
  const db = getDb();
  const over = await db
    .select({ userId: schema.inboxItems.userId, n: sql<number>`count(*)` })
    .from(schema.inboxItems)
    .where(isNull(schema.inboxItems.deletedAt))
    .groupBy(schema.inboxItems.userId)
    .having(gt(sql`count(*)`, cap))
    .limit(500);
  let pruned = 0;
  for (const u of over) {
    // The (created_at, id) of the cap-th newest open item is the cutoff.
    const cutoff = (
      await db
        .select({ createdAt: schema.inboxItems.createdAt, id: schema.inboxItems.id })
        .from(schema.inboxItems)
        .where(and(eq(schema.inboxItems.userId, u.userId), isNull(schema.inboxItems.deletedAt)))
        .orderBy(desc(schema.inboxItems.createdAt), desc(schema.inboxItems.id))
        .limit(1)
        .offset(cap - 1)
    )[0];
    if (!cutoff) continue;
    const out = await db
      .update(schema.inboxItems)
      .set({ deletedAt: Math.floor(Date.now() / 1000) })
      .where(
        and(
          eq(schema.inboxItems.userId, u.userId),
          isNull(schema.inboxItems.deletedAt),
          or(
            lt(schema.inboxItems.createdAt, cutoff.createdAt),
            and(eq(schema.inboxItems.createdAt, cutoff.createdAt), lt(schema.inboxItems.id, cutoff.id)),
          ),
        ),
      )
      .returning({ id: schema.inboxItems.id });
    pruned += out.length;
  }
  return { users: over.length, pruned };
}
