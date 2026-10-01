"use client";

/* Unified inbox (WEB-303) — two panes: the triage list on the left, the
 * conversation on the right. WEB-305 built the reading surface; WEB-306
 * builds the Linear layer on top: four tabs (Unread · All · Needs reply ·
 * Needs triage), the exact keymap (j/k · Enter · U · Alt+U · H · Backspace ·
 * Shift+Backspace · ⌘K · ?), snooze-with-reasons, per-row actions, search,
 * and load-more pagination (keyset) that keeps the list responsive at any
 * corpus size. SWR rhythm: mount + window focus + 30 s. */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  FileText,
  Images,
  Mail,
  PackageCheck,
  RefreshCw,
  Search,
  Send,
  Trash2,
  Users,
} from "lucide-react";

import { Button } from "@webcules/ui/components/button";
import { EmailFrame } from "@/components/inbox/email-frame";
import { CommandMenu } from "@/components/inbox/command-menu";
import { FilterMenu } from "@/components/inbox/filter-menu";
import { KIND_ICON, type InboxKind } from "@/components/inbox/kinds";
import { ShortcutsSheet } from "@/components/inbox/shortcuts-sheet";
import { SnoozeDialog } from "@/components/inbox/snooze-dialog";
import { splitReplyForDisplay } from "@/lib/strip-reply";

type Tab = "all" | "unread" | "needs-reply" | "needs-triage";

type ListItem = {
  id: string;
  kind: InboxKind;
  entityType: string;
  entityId: string;
  threadId: string | null;
  title: string;
  preview: string;
  readAt: number | null;
  snoozedUntil: number | null;
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

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "needs-reply", label: "Needs reply" },
  { id: "needs-triage", label: "Needs triage" },
];

/** List-pane width bounds + storage key for the drag-to-resize split. */
const SPLIT_MIN = 300;
const SPLIT_MAX = 640;
const SPLIT_DEFAULT = 360;
const SPLIT_KEY = "snap-inbox-split";

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

/** Relative list time — Linear's list is "2m", the pane keeps the stamp. */
function relTime(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

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
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [kindFilter, setKindFilter] = useState<InboxKind | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadData | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);

  // Dialogs (keymap gates on any of these being open).
  const [snoozeFor, setSnoozeFor] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  // Drag-to-resize split (list | divider | reading pane) — Linear-style.
  const [listWidth, setListWidth] = useState(SPLIT_DEFAULT);
  const widthRef = useRef(SPLIT_DEFAULT);
  widthRef.current = listWidth;
  useEffect(() => {
    const saved = Number(localStorage.getItem(SPLIT_KEY));
    if (Number.isFinite(saved) && saved >= SPLIT_MIN && saved <= SPLIT_MAX) setListWidth(saved);
  }, []);
  const onDividerDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = widthRef.current;
    let latest = startW; // persisted from the drag itself — the ref lags a render behind
    document.body.classList.add("cursor-col-resize", "select-none");
    const move = (ev: MouseEvent) => {
      latest = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, startW + ev.clientX - startX));
      setListWidth(latest);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.classList.remove("cursor-col-resize", "select-none");
      localStorage.setItem(SPLIT_KEY, String(latest));
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  const resetSplit = () => {
    setListWidth(SPLIT_DEFAULT);
    localStorage.setItem(SPLIT_KEY, String(SPLIT_DEFAULT));
  };

  // Composer state.
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const [mirror, setMirror] = useState(true);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox/unread-count", { cache: "no-store" });
      const body = (await res.json()) as { unread?: number };
      if (typeof body.unread === "number") setUnreadCount(body.unread);
    } catch {
      /* badge is best-effort */
    }
  }, []);

  // Params live in a ref so fetchList stays referentially stable — otherwise
  // the SWR effect below re-runs on every cursor change and double-fetches /
  // resets the list after Load more.
  const paramsRef = useRef({ tab, kindFilter, debouncedQ, nextCursor });
  paramsRef.current = { tab, kindFilter, debouncedQ, nextCursor };

  const fetchList = useCallback(async (opts: { append?: boolean } = {}) => {
    const { tab, kindFilter, debouncedQ, nextCursor } = paramsRef.current;
    const params = new URLSearchParams({ limit: "50", tab });
    if (kindFilter) params.set("kind", kindFilter);
    if (debouncedQ) params.set("q", debouncedQ);
    if (opts.append && nextCursor) params.set("cursor", nextCursor);
    try {
      const res = await fetch(`/api/inbox?${params.toString()}`, { cache: "no-store" });
      const body = (await res.json()) as { items?: ListItem[]; nextCursor?: string | null };
      if (body.items) {
        setItems((prev) => (opts.append ? [...prev, ...body.items!] : body.items!));
        setNextCursor(body.nextCursor ?? null);
      }
    } finally {
      setListLoading(false);
    }
  }, []);

  // SWR rhythm: fresh fetch when the view changes; mount + focus + 30 s
  // polling otherwise (push deliberately deferred).
  useEffect(() => {
    setListLoading(true);
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
  }, [tab, kindFilter, debouncedQ, fetchList, fetchUnread]);

  const selectedItem = items.find((i) => i.id === selectedId) ?? null;

  const openThread = useCallback(
    async (threadId: string) => {
      setOpenThreadId(threadId);
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

  /* ---------------- per-item + bulk actions (optimistic, reconciled) ---------------- */

  const act = useCallback(
    async (id: string, action: "read" | "unread" | "delete", extra?: Record<string, unknown>) => {
      const target = items.find((i) => i.id === id);
      if (!target) return;
      const wasUnread = target.readAt === null;
      const prev = items;
      // Optimistic flip (count only moves on a real transition).
      if (action === "delete") setItems((cur) => cur.filter((i) => i.id !== id));
      else setItems((cur) => cur.map((i) => (i.id === id ? { ...i, readAt: action === "read" ? 1 : null } : i)));
      if (wasUnread && action !== "unread") setUnreadCount((n) => Math.max(0, n - 1));
      if (action === "unread" && !wasUnread) setUnreadCount((n) => n + 1);
      try {
        const res = await fetch(`/api/inbox/items/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...extra }),
        });
        if (!res.ok) throw new Error();
      } catch {
        setItems(prev); // rollback
        void fetchUnread();
      }
    },
    [items, fetchUnread],
  );

  const snooze = useCallback(
    async (id: string, until: Date) => {
      const target = items.find((i) => i.id === id);
      if (!target) return;
      const prev = items;
      setItems((cur) => cur.filter((i) => i.id !== id)); // hidden until the moment passes
      if (target.readAt === null) setUnreadCount((n) => Math.max(0, n - 1));
      try {
        const res = await fetch(`/api/inbox/items/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "snooze", until: until.toISOString() }),
        });
        if (!res.ok) throw new Error();
      } catch {
        setItems(prev);
        void fetchUnread();
      }
    },
    [items, fetchUnread],
  );

  const bulk = useCallback(
    async (action: "mark-all-read" | "delete-read") => {
      const prev = items;
      if (action === "mark-all-read") {
        setItems((cur) => cur.map((i) => ({ ...i, readAt: 1 })));
        setUnreadCount(0);
      } else {
        setItems((cur) => cur.filter((i) => i.readAt === null));
      }
      try {
        const res = await fetch("/api/inbox/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        if (!res.ok) throw new Error();
      } catch {
        setItems(prev);
        void fetchUnread();
      }
    },
    [items, fetchUnread],
  );

  /* ---------------- the keymap (WEB-306 contract — ? sheet mirrors it) ---------------- */

  const keymapRef = useRef({ items, selectedId, openThreadId });
  keymapRef.current = { items, selectedId, openThreadId };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      const dialogOpen = snoozeFor !== null || shortcutsOpen || cmdOpen || filterOpen;
      if (e.key === "Escape") {
        if (dialogOpen) {
          // Dialogs manage their own close; the filter popover is ours.
          setFilterOpen(false);
          return;
        }
        if (keymapRef.current.openThreadId) {
          setOpenThreadId(null);
          setThread(null);
        }
        return;
      }
      if (typing || dialogOpen) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(true);
        return;
      }
      if (e.altKey && e.key.toLowerCase() === "u") {
        e.preventDefault();
        void bulk("mark-all-read");
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const { items: list, selectedId: sel } = keymapRef.current;
      const idx = list.findIndex((i) => i.id === sel);
      const select = (next: number) => {
        if (!list.length) return;
        const id = list[Math.max(0, Math.min(list.length - 1, next))].id;
        setSelectedId(id);
        rowRefs.current.get(id)?.scrollIntoView({ block: "nearest" });
      };
      switch (e.key) {
        case "j":
          e.preventDefault();
          select(idx < 0 ? 0 : idx + 1);
          break;
        case "k":
          e.preventDefault();
          select(idx < 0 ? list.length - 1 : idx - 1);
          break;
        case "Enter": {
          e.preventDefault();
          const cur = idx >= 0 ? list[idx] : null;
          if (cur?.threadId) {
            if (keymapRef.current.openThreadId === cur.threadId) {
              setOpenThreadId(null);
              setThread(null);
            } else {
              void openThread(cur.threadId);
            }
          }
          break;
        }
        case "u":
        case "U": {
          e.preventDefault();
          const cur = idx >= 0 ? list[idx] : null;
          if (cur) void act(cur.id, cur.readAt === null ? "read" : "unread");
          break;
        }
        case "h":
        case "H": {
          e.preventDefault();
          const cur = idx >= 0 ? list[idx] : null;
          if (cur) setSnoozeFor(cur.id);
          break;
        }
        case "Backspace": {
          e.preventDefault();
          if (e.shiftKey) {
            void bulk("delete-read");
          } else {
            const cur = idx >= 0 ? list[idx] : null;
            if (cur) {
              void act(cur.id, "delete");
              const nextSel = list[Math.min(list.length - 1, idx + 1)] ?? null;
              setSelectedId(nextSel?.id ?? null);
            }
          }
          break;
        }
        case "?":
          e.preventDefault();
          setShortcutsOpen(true);
          break;
        case "f":
        case "F":
          e.preventDefault();
          setFilterOpen((v) => !v);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, bulk, openThread, snoozeFor, shortcutsOpen, cmdOpen, filterOpen]);

  /* ---------------- composer ---------------- */

  async function sendReply() {
    if (!openThreadId || !reply.trim() || sending) return;
    setSending(true);
    setSendFailed(false);
    const body = reply;
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
      const res = await fetch(`/api/inbox/threads/${openThreadId}/reply`, {
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
      await fetch(`/api/inbox/threads/${openThreadId}`, { cache: "no-store" })
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

  const cmdTarget = {
    hasSelection: Boolean(selectedItem),
    leadId: thread?.thread.leadId ?? null,
    projectId: thread?.thread.projectId ?? null,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Header: tabs + search + bulk */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {TABS.map((t) => {
            const active = tab === t.id;
            const label = t.id === "unread" && unreadCount > 0 ? `Unread (${unreadCount})` : t.label;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-pressed={active}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-primary text-white"
                    : "border border-hairline bg-surface-1 text-ink-subtle hover:bg-surface-2 hover:text-ink"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <label className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the inbox…"
              aria-label="Search the inbox"
              className="w-48 rounded-full border border-hairline bg-surface-1 py-1.5 pl-8 pr-3 text-[13px] text-ink placeholder:text-ink-tertiary focus:w-64 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
          <Button variant="ghost" size="sm" onClick={() => setCmdOpen(true)} title="Command menu (⌘K)">
            ⌘K
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShortcutsOpen(true)} title="Keyboard shortcuts (?)">
            ?
          </Button>
        </div>
      </div>

      <div
        className="grid min-h-0 flex-1 gap-4 lg:gap-0 lg:grid-cols-[var(--list-w)_6px_minmax(0,1fr)]"
        style={{ ["--list-w" as string]: `${listWidth}px` }}
      >
        {/* List pane — hidden on mobile while a thread is open (slide-in). */}
        <aside
          aria-label="Inbox items"
          className={`min-h-64 flex-col overflow-hidden rounded-[12px] border border-hairline bg-surface-1 lg:flex lg:h-full ${
            openThreadId ? "hidden" : "flex"
          }`}
        >
          {/* Toolbar: filter menu + bulk actions (the keymap's mouse twins). */}
          <div className="flex items-center gap-1.5 border-b border-hairline px-3 py-2">
            <FilterMenu kind={kindFilter} onKind={setKindFilter} open={filterOpen} onOpenChange={setFilterOpen} />
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => void bulk("mark-all-read")}
                title="Mark everything read (Alt+U)"
                className="rounded-md p-1.5 text-ink-tertiary transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => void bulk("delete-read")}
                title="Delete everything read (Shift+Backspace)"
                className="rounded-md p-1.5 text-ink-tertiary transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto" role="list" aria-label="Conversations">
            {listLoading ? (
              <p className="p-4 text-sm text-ink-subtle">Loading…</p>
            ) : items.length === 0 ? (
              <p className="p-4 text-sm text-ink-subtle">
                {debouncedQ
                  ? "Nothing matches that search."
                  : tab === "unread"
                    ? "Nothing unread — nice."
                    : tab === "needs-reply"
                      ? "Every conversation is answered."
                      : tab === "needs-triage"
                        ? "Nothing waiting for triage."
                        : "No conversations yet. Inquiries, bookings and client replies land here."}
              </p>
            ) : (
              items.map((i) => {
                const Icon = KIND_ICON[i.kind] ?? Mail;
                const selected = i.id === selectedId;
                return (
                  <div
                    key={i.id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(i.id, el);
                      else rowRefs.current.delete(i.id);
                    }}
                    role="listitem"
                    data-selected={selected || undefined}
                    tabIndex={0}
                    onClick={() => {
                      setSelectedId(i.id);
                      if (i.threadId) void openThread(i.threadId);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        setSelectedId(i.id);
                        if (i.threadId) void openThread(i.threadId);
                      }
                    }}
                    className={`group flex w-full cursor-pointer items-start gap-3 border-b border-hairline px-4 py-3 text-left outline-none transition-colors ${
                      selected ? "bg-surface-2 ring-1 ring-inset ring-primary/40" : "hover:bg-surface-2/60 focus-visible:bg-surface-2/60"
                    }`}
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`flex items-baseline justify-between gap-2 ${i.readAt === null ? "font-semibold text-ink" : "text-ink"}`}>
                        <span className="truncate">{i.title}</span>
                        <span className="shrink-0 text-[11px] font-normal text-ink-tertiary">{relTime(i.createdAt)}</span>
                      </span>
                      <span className="block truncate text-xs text-ink-subtle">{i.preview || "—"}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-tertiary">
                        {i.threadId ? (
                          <span className="inline-flex items-center gap-0.5 rounded-full border border-hairline px-1.5 py-px">
                            <Mail className="h-2.5 w-2.5" aria-hidden /> thread
                          </span>
                        ) : null}
                        {i.kind}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-center gap-1">
                      {i.readAt === null && <span className="h-2 w-2 rounded-full bg-primary" aria-label="Unread" />}
                      {/* Row actions (hover/focus) — the keymap's mouse twins. */}
                      <span className="flex opacity-0 transition-opacity group-hover:focus-within:opacity-100 group-hover:opacity-100">
                        <button
                          type="button"
                          title={i.readAt === null ? "Mark read (U)" : "Mark unread (U)"}
                          onClick={(e) => {
                            e.stopPropagation();
                            void act(i.id, i.readAt === null ? "read" : "unread");
                          }}
                          className="rounded p-1 text-ink-tertiary hover:bg-surface-2 hover:text-ink"
                        >
                          <Check className="h-3 w-3" aria-hidden />
                        </button>
                        <button
                          type="button"
                          title="Snooze (H)"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSnoozeFor(i.id);
                          }}
                          className="rounded p-1 text-ink-tertiary hover:bg-surface-2 hover:text-ink"
                        >
                          <Clock className="h-3 w-3" aria-hidden />
                        </button>
                        <button
                          type="button"
                          title="Delete (Backspace)"
                          onClick={(e) => {
                            e.stopPropagation();
                            void act(i.id, "delete");
                          }}
                          className="rounded p-1 text-ink-tertiary hover:bg-surface-2 hover:text-ink"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden />
                        </button>
                      </span>
                    </span>
                  </div>
                );
              })
            )}
            {nextCursor && !listLoading && (
              <button
                type="button"
                onClick={() => void fetchList({ append: true })}
                className="w-full px-4 py-3 text-center text-[13px] font-medium text-primary transition-colors hover:bg-surface-2/60"
              >
                Load more
              </button>
            )}
          </div>
        </aside>

        {/* Drag-to-resize divider (desktop only) — double-click resets. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize list width"
          title="Drag to resize · double-click to reset"
          onMouseDown={onDividerDown}
          onDoubleClick={resetSplit}
          className="group relative hidden cursor-col-resize items-stretch justify-center lg:flex"
        >
          <span className="absolute inset-y-4 left-1/2 w-px -translate-x-1/2 bg-hairline transition-colors group-hover:bg-primary/50" />
        </div>

        {/* Reading pane */}
        <section
          aria-label="Conversation"
          className={`min-h-96 flex-col overflow-hidden rounded-[12px] border border-hairline bg-background lg:flex lg:h-full ${
            openThreadId ? "flex" : "hidden"
          }`}
        >
          {!openThreadId ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <p className="max-w-xs text-sm text-ink-subtle">
                Pick a conversation on the left — or drive it from the keyboard: <kbd className="rounded border border-hairline bg-surface-1 px-1 font-mono text-[11px]">j</kbd>{" "}
                <kbd className="rounded border border-hairline bg-surface-1 px-1 font-mono text-[11px]">k</kbd> to move,{" "}
                <kbd className="rounded border border-hairline bg-surface-1 px-1 font-mono text-[11px]">Enter</kbd> to open. Press{" "}
                <kbd className="rounded border border-hairline bg-surface-1 px-1 font-mono text-[11px]">?</kbd> for all shortcuts.
              </p>
            </div>
          ) : threadLoading ? (
            <div className="flex flex-1 items-center justify-center p-8">
              <RefreshCw className="h-4 w-4 animate-spin text-ink-subtle" aria-hidden />
            </div>
          ) : !thread ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-sm text-ink-subtle">
              <p>Couldn&rsquo;t load this conversation — try again.</p>
              <Button variant="outline" size="sm" onClick={() => openThreadId && void openThread(openThreadId)}>
                Retry
              </Button>
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
                <div className="flex items-center gap-2">
                  <p className="hidden shrink-0 text-xs text-ink-tertiary sm:block">{thread.thread.subject || "Conversation"}</p>
                  {/* Mobile slide-in back */}
                  <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => { setOpenThreadId(null); setThread(null); }}>
                    ← Inbox
                  </Button>
                </div>
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

      {/* Dialogs — the keymap and row buttons share them. */}
      <SnoozeDialog
        open={snoozeFor !== null}
        onOpenChange={(v) => !v && setSnoozeFor(null)}
        onSnooze={(until) => snoozeFor && void snooze(snoozeFor, until)}
      />
      <ShortcutsSheet open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <CommandMenu
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        target={cmdTarget}
        onSnooze={(until) => selectedItem && void snooze(selectedItem.id, until)}
        onToggleRead={() => selectedItem && void act(selectedItem.id, selectedItem.readAt === null ? "read" : "unread")}
        onMarkAllRead={() => void bulk("mark-all-read")}
        onDeleteRead={() => void bulk("delete-read")}
        onCloseThread={() => {
          setOpenThreadId(null);
          setThread(null);
        }}
      />
    </div>
  );
}
