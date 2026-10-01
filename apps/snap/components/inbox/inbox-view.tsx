"use client";

/* Unified inbox (WEB-305) — Linear-style two-pane: the item stream on the
 * left, the conversation (emails + system event cards, interleaved) on the
 * right, composer docked to the reading pane. SWR feel without realtime
 * infra: refetch on mount / window focus / 30 s. Optimistic mark-read and
 * reply with rollback. The triage layer (tabs, keymap, snooze) is WEB-306;
 * this is the reading surface. */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  CalendarDays,
  FileText,
  Images,
  Mail,
  PackageCheck,
  Users,
  ChevronDown,
  RefreshCw,
  Send,
} from "lucide-react";

import { Button } from "@webcules/ui/components/button";
import { EmailFrame } from "@/components/inbox/email-frame";
import { splitReplyForDisplay } from "@/lib/strip-reply";

type InboxKind = "email" | "booking" | "contract" | "invoice" | "gallery" | "order" | "lead";

type ListItem = {
  id: string;
  kind: InboxKind;
  entityType: string;
  entityId: string;
  threadId: string | null;
  title: string;
  preview: string;
  readAt: number | null;
  createdAt: string;
};

type TimelineMessage = {
  type: "message";
  id: string;
  direction: "in" | "out";
  from: string;
  subject: string;
  text: string;
  html?: string | null; // WEB-307 fills this; today's ingest is text-only
  status: string;
  hasAttachments: boolean;
  createdAt: string;
};

type TimelineEvent = {
  type: "event";
  id: string;
  kind: InboxKind;
  title: string;
  preview: string;
  entityType: string;
  entityId: string;
  wasUnread: boolean;
  createdAt: string;
};

type TimelineEntry = TimelineMessage | TimelineEvent;

type ThreadData = {
  thread: {
    id: string;
    subject: string;
    clientEmail: string;
    clientName: string;
    leadId: string | null;
    projectId: string | null;
    lastDirection: string | null;
  };
  timeline: TimelineEntry[];
  snippets: Array<{ id: string; name: string; text: string }>;
  signature: string;
};

const KIND_ICON: Record<InboxKind, typeof Mail> = {
  email: Mail,
  booking: CalendarDays,
  contract: FileText,
  invoice: Banknote,
  gallery: Images,
  order: PackageCheck,
  lead: Users,
};

function eventLink(e: TimelineEvent, t: ThreadData["thread"]): { href: string; label: string } {
  switch (e.entityType) {
    case "lead":
      return { href: `/dashboard/leads/${e.entityId}`, label: "View lead" };
    case "contract":
      return { href: t.projectId ? `/dashboard/projects/${t.projectId}` : "/dashboard/projects", label: "View project" };
    case "invoice":
      return { href: t.projectId ? `/dashboard/projects/${t.projectId}` : "/dashboard/transactions", label: "View payments" };
    case "gallery":
      return { href: "/dashboard/galleries", label: "View galleries" };
    case "booking":
      return { href: t.projectId ? `/dashboard/projects/${t.projectId}` : "/dashboard/calendar", label: "View booking" };
    default:
      return { href: "/dashboard/inbox", label: "Open" };
  }
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** A client email: quote-collapsed text (render-time split — the stored body
 * is never touched), sandboxed iframe when an HTML body exists. */
function InboundMessage({ m, clientName }: { m: TimelineMessage; clientName: string }) {
  const { visible, trimmed } = useMemo(() => splitReplyForDisplay(m.text), [m.text]);
  const [showTrimmed, setShowTrimmed] = useState(false);
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-[12px] border border-hairline bg-white px-4 py-3 text-sm text-ink" style={{ boxShadow: "0 1px 2px rgba(16,17,19,0.04)" }}>
        <p className="mb-1 text-[11px] uppercase tracking-wide text-ink-tertiary">
          {clientName} · {fmtTime(m.createdAt)}
        </p>
        {m.html ? (
          <EmailFrame html={m.html} title={`Email from ${clientName}`} />
        ) : (
          <p className="whitespace-pre-wrap leading-relaxed">{visible}</p>
        )}
        {trimmed && (
          <div className="mt-2 border-t border-hairline pt-1.5">
            <button
              type="button"
              onClick={() => setShowTrimmed((v) => !v)}
              aria-expanded={showTrimmed}
              className="flex items-center gap-1 text-xs font-medium text-ink-subtle transition-colors hover:text-ink"
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${showTrimmed ? "" : "-rotate-90"}`} aria-hidden />
              {showTrimmed ? "Hide trimmed content" : "Show trimmed content"}
            </button>
            {showTrimmed && (
              <pre className="mt-1.5 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-surface-1 p-2.5 text-xs leading-relaxed text-ink-subtle">{trimmed}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function OutboundMessage({ m, studioLabel }: { m: TimelineMessage; studioLabel: string }) {
  return (
    <div className="flex justify-end">
      <div
        className={`max-w-[85%] rounded-[12px] border px-4 py-3 text-sm ${
          m.status === "failed"
            ? "border-destructive/40 bg-destructive/5"
            : "border-primary/30 bg-primary/10"
        }`}
      >
        <p className="mb-1 text-[11px] uppercase tracking-wide text-ink-tertiary">
          {studioLabel} · {fmtTime(m.createdAt)}
          {m.status === "failed" ? " · delivery failed" : ""}
        </p>
        <p className="whitespace-pre-wrap leading-relaxed text-ink">{m.text}</p>
      </div>
    </div>
  );
}

function EventCard({ e, thread }: { e: TimelineEvent; thread: ThreadData["thread"] }) {
  const Icon = KIND_ICON[e.kind] ?? Mail;
  const link = eventLink(e, thread);
  return (
    <div className="flex justify-center">
      <div className="flex max-w-[92%] items-center gap-3 rounded-[10px] border border-hairline bg-surface-1 px-3.5 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ink">{e.title}</p>
          <p className="truncate text-xs text-ink-subtle">
            {fmtTime(e.createdAt)}
            {e.preview ? ` · ${e.preview}` : ""}
          </p>
        </div>
        <Link href={link.href} className="shrink-0 text-xs font-medium text-primary hover:underline">
          {link.label}
        </Link>
      </div>
    </div>
  );
}

export function InboxView({ contactEmail, studioName }: { contactEmail: string | null; studioName: string }) {
  const [items, setItems] = useState<ListItem[]>([]);
  const [unreadFilter, setUnreadFilter] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadData | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);

  // Composer state.
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const [mirror, setMirror] = useState(true);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const fetchList = useCallback(
    async () => {
      try {
        const res = await fetch(`/api/inbox?limit=50${unreadFilter ? "&tab=unread" : ""}`, { cache: "no-store" });
        const body = (await res.json()) as { items?: ListItem[] };
        if (body.items) setItems(body.items);
      } finally {
        setListLoading(false);
      }
    },
    [unreadFilter],
  );

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox/unread-count", { cache: "no-store" });
      const body = (await res.json()) as { unread?: number };
      if (typeof body.unread === "number") setUnreadCount(body.unread);
    } catch {
      /* badge is best-effort */
    }
  }, []);

  // SWR rhythm: mount + focus + 30 s polling (push deliberately deferred).
  useEffect(() => {
    void fetchList();
    void fetchUnread();
    const t = setInterval(() => {
      void fetchList();
      void fetchUnread();
    }, 30_000);
    const onFocus = () => {
      void fetchList();
      void fetchUnread();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchList, fetchUnread]);

  const openThread = useCallback(
    async (threadId: string) => {
      setSelectedThreadId(threadId);
      setThreadLoading(true);
      setThread(null);
      setSendFailed(false);
      // Optimistic read: the GET marks items read server-side; mirror it
      // locally so unread styling drops immediately, reconcile on refetch.
      const affected = items.filter((i) => i.threadId === threadId && i.readAt === null).length;
      if (affected) {
        setItems((prev) => prev.map((i) => (i.threadId === threadId && i.readAt === null ? { ...i, readAt: 1 } : i)));
        setUnreadCount((n) => Math.max(0, n - affected));
      }
      try {
        const res = await fetch(`/api/inbox/threads/${threadId}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        setThread((await res.json()) as ThreadData);
      } catch {
        // Rollback the optimistic read on failure.
        if (affected) {
          setItems((prev) => prev.map((i) => (i.threadId === threadId && i.readAt === 1 ? { ...i, readAt: null } : i)));
          void fetchUnread();
        }
        setThread(null);
      } finally {
        setThreadLoading(false);
      }
    },
    [items, fetchUnread],
  );

  async function sendReply() {
    if (!selectedThreadId || !reply.trim() || sending) return;
    setSending(true);
    setSendFailed(false);
    const body = reply;
    // Optimistic pending bubble (id free-form; replaced by refetch).
    const pending: TimelineMessage = {
      type: "message",
      id: `pending-${Date.now()}`,
      direction: "out",
      from: "",
      subject: "",
      text: body,
      status: "sent",
      hasAttachments: false,
      createdAt: new Date().toISOString(),
    };
    setThread((t) => (t ? { ...t, timeline: [...t.timeline, pending] } : t));
    try {
      const res = await fetch(`/api/inbox/threads/${selectedThreadId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, mirrorCopy: mirror }),
      });
      const out = (await res.json().catch(() => ({}))) as { delivered?: boolean };
      if (!res.ok) throw new Error("reply_failed");
      if (out.delivered === false) {
        // Recorded but not delivered — keep the draft so Retry (and edits) work.
        setSendFailed(true);
      } else {
        setReply("");
      }
      await fetch(`/api/inbox/threads/${selectedThreadId}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((t) => t && setThread(t as ThreadData));
      void fetchList();
      void fetchUnread();
    } catch {
      // Rollback the pending bubble.
      setThread((t) => (t ? { ...t, timeline: t.timeline.filter((e) => e.id !== pending.id) } : t));
      setSendFailed(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.6px] text-ink">Inbox</h1>
          <p className="mt-0.5 text-sm text-ink-subtle">
            {unreadCount > 0 ? `${unreadCount} unread` : "Everything read"} · conversations and studio events in one stream
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {(["all", "unread"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setUnreadFilter(f === "unread")}
              aria-pressed={unreadFilter === (f === "unread")}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                (f === "unread") === unreadFilter
                  ? "bg-primary text-white"
                  : "border border-hairline bg-surface-1 text-ink-subtle hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {f === "all" ? "All" : `Unread${unreadCount ? ` (${unreadCount})` : ""}`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[340px_1fr]">
        {/* List pane */}
        <aside
          aria-label="Inbox items"
          className="flex min-h-64 flex-col overflow-hidden rounded-[12px] border border-hairline bg-surface-1 lg:h-full"
        >
          <div className="min-h-0 flex-1 overflow-y-auto" role="list" aria-label="Conversations">
            {listLoading ? (
              <p className="p-4 text-sm text-ink-subtle">Loading…</p>
            ) : items.length === 0 ? (
              <p className="p-4 text-sm text-ink-subtle">
                {unreadFilter ? "Nothing unread — nice." : "No conversations yet. Inquiries, bookings and client replies land here."}
              </p>
            ) : (
              items.map((i) => {
                const Icon = KIND_ICON[i.kind] ?? Mail;
                const active = i.threadId === selectedThreadId;
                return (
                  <button
                    key={i.id}
                    type="button"
                    role="listitem"
                    aria-current={active ? "true" : undefined}
                    onClick={() => i.threadId && void openThread(i.threadId)}
                    className={`flex w-full items-start gap-3 border-b border-hairline px-4 py-3 text-left transition-colors ${
                      active ? "bg-surface-2" : "hover:bg-surface-2/60"
                    }`}
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm ${i.readAt === null ? "font-semibold text-ink" : "text-ink"}`}>
                        {i.title}
                      </span>
                      <span className="block truncate text-xs text-ink-subtle">{i.preview || "—"}</span>
                      <span className="mt-0.5 block text-[11px] text-ink-tertiary">{fmtTime(i.createdAt)}</span>
                    </span>
                    {i.readAt === null && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Reading pane */}
        <section
          aria-label="Conversation"
          className="flex min-h-96 flex-col overflow-hidden rounded-[12px] border border-hairline bg-background lg:h-full"
        >
          {!selectedThreadId ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <p className="max-w-xs text-sm text-ink-subtle">
                Pick a conversation on the left. Emails, bookings, contracts, invoices and gallery events sit in one timeline.
              </p>
            </div>
          ) : threadLoading ? (
            <div className="flex flex-1 items-center justify-center p-8">
              <RefreshCw className="h-4 w-4 animate-spin text-ink-subtle" aria-hidden />
            </div>
          ) : !thread ? (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-ink-subtle">
              Couldn&rsquo;t load this conversation — try again.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-5 py-3.5">
                <div className="min-w-0">
                  <h2 className="truncate text-[15px] font-medium text-ink">{thread.thread.clientName}</h2>
                  <p className="truncate text-xs text-ink-subtle">
                    {thread.thread.clientEmail}
                    {thread.thread.leadId ? (
                      <>
                        {" · "}
                        <Link href={`/dashboard/leads/${thread.thread.leadId}`} className="text-primary hover:underline">
                          view lead
                        </Link>
                      </>
                    ) : null}
                    {thread.thread.projectId ? (
                      <>
                        {" · "}
                        <Link href={`/dashboard/projects/${thread.thread.projectId}`} className="text-primary hover:underline">
                          view project
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-ink-tertiary">{thread.thread.subject || "Conversation"}</p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <div className="flex flex-col gap-3">
                  {thread.timeline.map((e) =>
                    e.type === "message" ? (
                      e.direction === "in" ? (
                        <InboundMessage key={e.id} m={e} clientName={thread.thread.clientName} />
                      ) : (
                        <OutboundMessage key={e.id} m={e} studioLabel={studioName} />
                      )
                    ) : (
                      <EventCard key={e.id} e={e} thread={thread.thread} />
                    ),
                  )}
                </div>
              </div>

              {/* Composer */}
              <div className="border-t border-hairline bg-surface-1 px-5 py-3.5">
                {sendFailed && (
                  <p className="mb-2 flex items-center justify-between gap-3 rounded-md bg-amber-500/10 px-3 py-2 text-[13px] text-amber-700 dark:text-amber-400">
                    <span>Email delivery didn&rsquo;t go out — your reply is saved on the thread.</span>
                    <button type="button" onClick={() => void sendReply()} disabled={sending || !reply.trim()} className="font-medium underline underline-offset-2">
                      Retry send
                    </button>
                  </p>
                )}
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {thread.snippets.length > 0 && (
                    <select
                      className="rounded-md border border-hairline bg-canvas px-2 py-1.5 text-xs text-ink-muted outline-none"
                      value=""
                      onChange={(e) => {
                        const snip = thread.snippets.find((s) => s.id === e.target.value);
                        if (snip) setReply((r) => (r ? `${r}\n\n${snip.text}` : snip.text));
                        composerRef.current?.focus();
                      }}
                      aria-label="Insert a saved reply"
                    >
                      <option value="">Insert a saved reply…</option>
                      {thread.snippets.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={() => setReply((r) => (r ? `${r}\n\n{{gallery_link}}` : "{{gallery_link}}"))}
                    className="rounded-md border border-hairline bg-canvas px-2 py-1.5 text-xs text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
                    title="Inserts the client's gallery link — resolved when the email sends"
                  >
                    + Gallery link
                  </button>
                  <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-ink-subtle">
                    <input
                      type="checkbox"
                      checked={mirror}
                      onChange={(e) => setMirror(e.target.checked)}
                      className="h-3.5 w-3.5 accent-[var(--accent,#5e6ad2)]"
                    />
                    Send a copy to {contactEmail ?? "your contact inbox"}
                  </label>
                </div>
                <textarea
                  ref={composerRef}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={`Reply to ${thread.thread.clientName.split(" ")[0]}…`}
                  className="min-h-[88px] w-full resize-vertical rounded-md border border-input bg-background px-3 py-2 text-sm text-ink placeholder:text-ink-tertiary"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-[11px] text-ink-tertiary">
                    Sends from your studio address{thread.signature ? " · signature added automatically" : ""}
                  </p>
                  <Button size="sm" onClick={() => void sendReply()} disabled={sending || !reply.trim()}>
                    <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    {sending ? "Sending…" : "Send reply"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
