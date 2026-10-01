"use client";

/* Sidebar unread badge (WEB-306) — one number, one truth: open (unread,
 * non-snoozed, non-deleted) items from /api/inbox/unread-count. Mounts with
 * the dashboard nav, refreshes on focus + every 60 s, and mirrors the count
 * into document.title ("(3) · …") so a backgrounded tab still signals. */
import { useEffect, useState } from "react";

let cachedCount: number | null = null;
const listeners = new Set<(n: number) => void>();

async function refresh() {
  try {
    const res = await fetch("/api/inbox/unread-count", { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as { unread?: number };
    if (typeof body.unread === "number") {
      cachedCount = body.unread;
      for (const l of listeners) l(body.unread);
    }
  } catch {
    /* badge is best-effort */
  }
}

let started = false;
function ensurePolling() {
  if (started || typeof window === "undefined") return;
  started = true;
  const tick = () => void refresh();
  window.addEventListener("focus", tick);
  setInterval(tick, 60_000);
  void refresh();
}

export function InboxNavBadge() {
  const [n, setN] = useState<number | null>(cachedCount);
  useEffect(() => {
    listeners.add(setN);
    ensurePolling();
    void refresh();
    return () => {
      listeners.delete(setN);
    };
  }, []);

  // Title sync: prefix the count while there are unread items, restore on unmount.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = n && n > 0 ? `(${n}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [n]);

  if (!n || n <= 0) return null;
  return (
    <span
      aria-label={`${n} unread`}
      className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-none text-white"
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}
