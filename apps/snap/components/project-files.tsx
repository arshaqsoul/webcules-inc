"use client";

/* Project files workspace (Epic 8) — grid/list views with filters + sort +
 * keyset paging (WEB-120), tags (WEB-121), bulk selection + actions with
 * partial-failure reporting (WEB-128), and the upload queue: XHR progress,
 * bounded parallelism, retry/backoff, pause/resume, failure isolation
 * (WEB-113). Fast triage lives in <TriageMode> (WEB-122). */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@webcules/ui/components/button";
import { useConfirm } from "@/components/confirm-provider";
import { TriageMode } from "@/components/triage-mode";

export type AssetItem = {
  id: string;
  filename: string;
  kind: string;
  status: string;
  bytes: number;
  mimeType: string;
  /** RAW vault (WEB-153): epoch seconds when moved to cold storage; null = hot. */
  rawArchivedAt: number | null;
  tags: string[];
  createdAt: string;
};

type Feed = { items: AssetItem[]; nextCursor: string | null; counts: Record<string, number>; tags: { tag: string; n: number }[] };
type QueueState = "pending" | "uploading" | "done" | "failed" | "canceled";
type QueueItem = { id: string; name: string; size: number; progress: number; state: QueueState; attempts: number; error?: string };

const STATUS_BADGE: Record<string, string> = {
  uploaded: "bg-surface-2 text-ink-subtle",
  approved: "bg-success/10 text-success-text",
  rejected: "bg-destructive/10 text-destructive",
  shared: "bg-primary/10 text-primary",
};
const KINDS = ["image", "video", "raw"];
const STATUSES = ["uploaded", "approved", "rejected", "shared"];
const UPLOAD_PARALLELISM = 4;

function mb(bytes: number): string {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function ProjectFiles({ projectId, initial }: { projectId: string; initial?: AssetItem[] }) {
  const confirm = useConfirm();
  const [feed, setFeed] = useState<Feed>({ items: initial ?? [], nextCursor: null, counts: {}, tags: [] });
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState("date");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [loading, setLoading] = useState(false);

  // Selection (WEB-128): click toggle, shift-range, clear.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const lastClicked = useRef<number>(-1);

  // Upload queue (WEB-113).
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [paused, setPaused] = useState(false);
  const filesPending = useRef<{ file: File; itemId: string }[]>([]);
  const activeXhrs = useRef<Map<string, XMLHttpRequest>>(new Map());
  const itemById = useRef<Map<string, QueueItem>>(new Map());
  const [triageOpen, setTriageOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const query = useCallback(
    (cursor?: string | null) => {
      const p = new URLSearchParams();
      if (status) p.set("status", status);
      if (kind) p.set("kind", kind);
      if (tag) p.set("tag", tag);
      if (sort) p.set("sort", sort);
      if (cursor) p.set("cursor", cursor);
      return `/api/projects/${projectId}/assets?${p}`;
    },
    [projectId, status, kind, tag, sort],
  );

  const load = useCallback(
    async (replace: boolean) => {
      setLoading(true);
      try {
        const res = await fetch(query(replace ? null : feed.nextCursor));
        if (res.ok) {
          const page = (await res.json()) as Feed;
          setFeed((prev) => ({
            items: replace ? page.items : [...prev.items, ...page.items],
            nextCursor: page.nextCursor,
            counts: page.counts,
            tags: page.tags,
          }));
          // reflect view/filter in the URL (WEB-120)
          const url = new URL(window.location.href);
          url.searchParams.set("fv", view);
          if (status) url.searchParams.set("fs", status); else url.searchParams.delete("fs");
          if (kind) url.searchParams.set("fk", kind); else url.searchParams.delete("fk");
          window.history.replaceState(null, "", url);
        }
      } catch { /* keep previous page */ }
      setLoading(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- feed.nextCursor read on purpose
    [query, view, status, kind],
  );

  // reload on filter/sort change; restore view from URL once
  useEffect(() => {
    const u = new URL(window.location.href);
    const v = u.searchParams.get("fv");
    if (v === "list" || v === "grid") setView(v);
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on filter change
  }, [status, kind, tag, sort]);

  const refresh = useCallback(() => void load(true), [load]);

  /* ---------------- Bulk actions (WEB-128) ---------------- */

  async function bulk(action: string, tagValue?: string) {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (action === "delete" && !(await confirm({ title: "Delete files?", body: `Delete ${ids.length} file${ids.length === 1 ? "" : "s"} permanently?`, destructive: true }))) return;
    if (action === "reject" && !(await confirm({ title: "Reject files?", body: `Reject ${ids.length} file${ids.length === 1 ? "" : "s"}?` }))) return;
    setNotice("");
    try {
      const res = await fetch("/api/assets/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, assetIds: ids, tag: tagValue }),
      });
      const body = (await res.json().catch(() => ({}))) as { done?: number; blocked?: { assetId: string }[] };
      const blocked = body.blocked?.length ?? 0;
      setNotice(
        blocked
          ? `${body.done ?? 0} done · ${blocked} blocked (in an active client gallery)`
          : `${body.done ?? 0} file${(body.done ?? 0) === 1 ? "" : "s"} updated`,
      );
      setSelected(new Set());
      refresh();
    } catch {
      setNotice("Network error — try again.");
    }
  }

  function toggleSelect(id: string, index: number, shift: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift && lastClicked.current >= 0) {
        const [a, b] = [lastClicked.current, index].sort((x, y) => x - y);
        for (let i = a; i <= b; i++) next.add(feed.items[i].id);
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    lastClicked.current = index;
  }

  /* ---------------- Upload queue (WEB-113) ---------------- */

  const updateItem = useCallback((itemId: string, patch: Partial<QueueItem>) => {
    setQueue((q) => q.map((it) => (it.id === itemId ? { ...it, ...patch } : it)));
  }, []);

  const startItem = useCallback(
    (itemId: string, file: File, attempt: number) => {
      const xhr = new XMLHttpRequest();
      activeXhrs.current.set(itemId, xhr);
      const backoff = Math.min(9000, 1000 * 3 ** attempt);
      xhr.open("POST", `/api/projects/${projectId}/upload`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) updateItem(itemId, { progress: Math.round((e.loaded / e.total) * 100) });
      };
      xhr.onload = () => {
        activeXhrs.current.delete(itemId);
        if (xhr.status >= 200 && xhr.status < 300) {
          updateItem(itemId, { state: "done", progress: 100 });
        } else if (attempt < 3) {
          updateItem(itemId, { state: "pending", progress: 0, attempts: attempt + 1, error: `HTTP ${xhr.status}` });
          // re-queue with exponential backoff (1s → 3s → 9s)
          setTimeout(() => {
            if (itemById.current.has(itemId)) {
              updateItem(itemId, { state: "uploading" });
              startItem(itemId, file, attempt + 1);
            }
          }, backoff);
        } else {
          updateItem(itemId, { state: "failed", error: `HTTP ${xhr.status}` });
        }
        pump();
      };
      xhr.onerror = () => {
        activeXhrs.current.delete(itemId);
        if (attempt < 3) {
          setTimeout(() => {
            if (itemById.current.has(itemId)) {
              updateItem(itemId, { state: "uploading" });
              startItem(itemId, file, attempt + 1);
            }
          }, backoff);
        } else {
          updateItem(itemId, { state: "failed", error: "network" });
        }
        pump();
      };
      const form = new FormData();
      form.set("file", file);
      updateItem(itemId, { state: "uploading", attempts: attempt + 1 });
      xhr.send(form);
    },
    [projectId, paused, updateItem],
  );

  const pump = useCallback(() => {
    if (paused || uploading) return;
    const activeCount = activeXhrs.current.size;
    let slots = UPLOAD_PARALLELISM - activeCount;
    while (slots > 0 && filesPending.current.length) {
      const next = filesPending.current.shift();
      if (!next) break;
      slots--;
      startItem(next.itemId, next.file, itemById.current.get(next.itemId)?.attempts ?? 0);
    }
  }, [paused, uploading, startItem]);

  function cancelUploads() {
    for (const xhr of activeXhrs.current.values()) xhr.abort();
    activeXhrs.current.clear();
    filesPending.current = [];
    setQueue((q) => q.map((it) => (it.state === "pending" || it.state === "uploading" ? { ...it, state: "canceled" } : it)));
    setUploading(false);
  }

  function retryFailed() {
    const failed = queue.filter((it) => it.state === "failed" || it.state === "canceled");
    if (!failed.length) return;
    // re-attach files: failed items kept their File in a side map
    for (const it of failed) {
      const f = fileStore.current.get(it.id);
      if (!f) continue;
      fileStore.current.delete(it.id);
      itemById.current.set(it.id, { ...it, state: "pending", attempts: 0, progress: 0 });
      filesPending.current.push({ file: f, itemId: it.id });
    }
    setQueue((q) => q.map((it) => (it.state === "failed" || it.state === "canceled" ? { ...it, state: "pending", attempts: 0, progress: 0, error: undefined } : it)));
    setUploading(true);
    setPaused(false);
    pump();
  }

  // file store for retries/cancel mapping
  const fileStore = useRef<Map<string, File>>(new Map());
  function enqueueWithStore(files: FileList | File[]) {
    const arr = Array.from(files);
    // stash files for retry support
    const stash = arr.map((_, i) => `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`);
    stash.forEach((id, i) => fileStore.current.set(id, arr[i]));
    const items: QueueItem[] = arr.map((file, i) => ({
      id: stash[i],
      name: file.name,
      size: file.size,
      progress: 0,
      state: "pending",
      attempts: 0,
    }));
    for (const it of items) itemById.current.set(it.id, it);
    filesPending.current.push(...arr.map((file, i) => ({ file, itemId: stash[i] })));
    setQueue((q) => [...q, ...items]);
    setUploading(true);
    setPaused(false);
    pump();
  }

  // queue completion → refresh + summary
  useEffect(() => {
    if (!uploading) return;
    const active = queue.filter((q) => q.state === "pending" || q.state === "uploading");
    if (active.length === 0 && queue.length > 0) {
      setUploading(false);
      const failed = queue.filter((q) => q.state === "failed").length;
      setNotice(failed ? `Upload finished — ${failed} failed. Retry the failures below.` : "All uploads finished.");
      refresh();
      setTimeout(() => setQueue([]), 5000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- completion watcher
  }, [queue, uploading]);

  const inputRef = useRef<HTMLInputElement>(null);
  const counts = feed.counts;
  const activeFilters = Boolean(status || kind || tag);

  const summary = useMemo(() => {
    const done = queue.filter((q) => q.state === "done").length;
    const failed = queue.filter((q) => q.state === "failed").length;
    return { done, failed, total: queue.length };
  }, [queue]);

  /* ---------------- Render ---------------- */

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-hairline bg-surface-1 p-3">
        <div className="mr-2 text-sm text-ink-subtle">
          {Object.values(counts).reduce((a, b) => a + b, 0)} file{Object.values(counts).reduce((a, b) => a + b, 0) === 1 ? "" : "s"}
          {counts.approved ? ` · ${counts.approved} approved` : ""}
          {counts.rejected ? ` · ${counts.rejected} rejected` : ""}
          {counts.shared ? ` · ${counts.shared} shared` : ""}
        </div>

        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status" className="rounded-md border border-hairline bg-canvas px-2 py-1.5 text-xs text-ink-muted">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Filter kind" className="rounded-md border border-hairline bg-canvas px-2 py-1.5 text-xs text-ink-muted">
          <option value="">All types</option>
          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter tag" className="rounded-md border border-hairline bg-canvas px-2 py-1.5 text-xs text-ink-muted">
          <option value="">All tags</option>
          {feed.tags.map((t) => <option key={t.tag} value={t.tag}>{t.tag} ({t.n})</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort" className="rounded-md border border-hairline bg-canvas px-2 py-1.5 text-xs text-ink-muted">
          <option value="date">Newest</option>
          <option value="name">Name</option>
          <option value="size">Largest</option>
          <option value="status">Status</option>
        </select>

        <div className="ml-auto flex items-center gap-1.5">
          <div className="flex overflow-hidden rounded-md border border-hairline">
            {(["grid", "list"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-2.5 py-1.5 text-xs ${view === v ? "bg-primary/10 text-primary" : "text-ink-muted hover:bg-surface-2"}`}
              >
                {v === "grid" ? "Grid" : "List"}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={() => { setSelectMode((s) => !s); setSelected(new Set()); }}>
            {selectMode ? "Done selecting" : "Select"}
          </Button>
          <Button size="sm" variant="outline" disabled={!feed.items.length} onClick={() => setTriageOpen(true)}>
            Triage
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,.avif,.heic,.gif,.mp4,.mov,.webm,.cr2,.cr3,.nef,.arw,.dng,.rwl"
            className="hidden"
            onChange={(e) => e.target.files?.length && enqueueWithStore(e.target.files)}
          />
          <Button size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files?.length) enqueueWithStore(e.dataTransfer.files);
        }}
        className="rounded-[12px] border border-dashed border-hairline-strong bg-surface-1 p-4 text-center text-xs text-ink-subtle"
      >
        Drag & drop photos, videos, and RAWs here (up to 100 MB per file)
      </div>

      {notice && <p className="text-xs text-ink-muted">{notice}</p>}

      {/* Upload queue (WEB-113) */}
      {queue.length > 0 && (
        <div className="flex flex-col gap-2 rounded-[12px] border border-hairline bg-surface-1 p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-subtle">
            <span>
              {summary.done}/{summary.total} uploaded
              {summary.failed ? ` · ${summary.failed} failed` : ""}
            </span>
            <div className="ml-auto flex gap-1.5">
              {uploading && (
                <Button size="sm" variant="ghost" onClick={() => { setPaused(!paused); if (paused) pump(); }}>
                  {paused ? "Resume" : "Pause"}
                </Button>
              )}
              {summary.failed > 0 && !uploading && (
                <Button size="sm" variant="outline" onClick={retryFailed}>Retry failed</Button>
              )}
              {uploading && (
                <Button size="sm" variant="ghost" onClick={cancelUploads}>Cancel</Button>
              )}
            </div>
          </div>
          {queue.slice(-50).map((q) => (
            <div key={q.id} className="flex items-center gap-2 text-xs">
              <span className="w-44 truncate text-ink-muted" title={q.name}>{q.name} ({mb(q.size)})</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={`h-full transition-[width] ${q.state === "failed" ? "bg-destructive" : q.state === "done" ? "bg-success" : "bg-primary"}`}
                  style={{ width: `${q.state === "done" ? 100 : q.progress}%` }}
                />
              </div>
              <span className={`w-20 text-right ${q.state === "failed" ? "text-destructive" : q.state === "done" ? "text-success-text" : "text-ink-tertiary"}`}>
                {q.state === "uploading" ? `${q.progress}%` : q.state === "pending" ? (q.attempts ? `retry ${q.attempts}` : "waiting") : q.state}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Bulk action bar (WEB-128) */}
      {selectMode && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-1.5 rounded-[12px] border border-hairline bg-surface-1 p-2.5 shadow-sm">
          <span className="px-1 text-xs text-ink-subtle">{selected.size} selected</span>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(feed.items.map((a) => a.id)))}>All</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>None</Button>
          <span className="mx-1 h-4 w-px bg-hairline" aria-hidden />
          <Button size="sm" variant="outline" disabled={!selected.size} onClick={() => void bulk("approve")}>Approve</Button>
          <Button size="sm" variant="outline" disabled={!selected.size} onClick={() => void bulk("reject")}>Reject</Button>
          <Button size="sm" variant="outline" disabled={!selected.size} onClick={() => void bulk("tag", "favorite")}>Favorite</Button>
          <TagInput disabled={!selected.size} onTag={(t) => void bulk("tag", t)} />
          <Button size="sm" variant="ghost" disabled={!selected.size} onClick={() => void bulk("delete")}>Delete</Button>
        </div>
      )}

      {/* Grid view */}
      {view === "grid" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {feed.items.map((a, i) => (
            <div
              key={a.id}
              className={`relative flex flex-col overflow-hidden rounded-[12px] border bg-surface-1 ${
                selected.has(a.id) ? "border-primary ring-1 ring-primary/40" : "border-hairline"
              }`}
            >
              {selectMode && (
                <input
                  type="checkbox"
                  checked={selected.has(a.id)}
                  onClick={(e) => { e.stopPropagation(); toggleSelect(a.id, i, e.shiftKey); }}
                  onChange={() => undefined}
                  className="absolute left-2 top-2 z-10 h-4 w-4 accent-[var(--primary)]"
                  aria-label={`Select ${a.filename}`}
                />
              )}
              <a href={`/api/assets/${a.id}`} target="_blank" rel="noreferrer" className="block aspect-square bg-canvas" onClick={(e) => selectMode && e.preventDefault()}>
                {a.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- authorized proxy, no optimizer
                  <img src={`/api/assets/${a.id}`} alt={a.filename} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-tertiary">
                    <span className="text-xs uppercase">{a.kind}</span>
                    <span className="text-[10px]">.{a.filename.split(".").pop()}</span>
                  </span>
                )}
              </a>
              <div className="flex flex-col gap-1.5 p-2">
                <div className="flex items-center justify-between gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[a.status] ?? ""}`}>{a.status}</span>
                  {a.rawArchivedAt && <a href="/dashboard/raw-vault" title="In RAW vault cold storage — restorable from the RAW Vault page" className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-400">❄ cold</a>}
                  {a.tags.includes("favorite") && <span title="Favorite" className="text-[10px] text-amber-500">★</span>}
                  <span className="text-[10px] text-ink-tertiary">{mb(a.bytes)}</span>
                </div>
                <p className="truncate text-[11px] text-ink-muted" title={a.filename}>{a.filename}</p>
                {a.status === "shared" && (
                  <p className="text-[10px] text-ink-tertiary" title="In an active client gallery — revoke the gallery link to edit or delete">🔒 locked</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List view */}
      {view === "list" && feed.items.length > 0 && (
        <div className="overflow-x-auto rounded-[12px] border border-hairline bg-surface-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-ink-tertiary">
                {selectMode && <th className="w-8 px-3 py-2.5" />}
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Size</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Tags</th>
                <th className="px-4 py-2.5 font-medium">Uploaded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {feed.items.map((a, i) => (
                <tr
                  key={a.id}
                  className={`cursor-default ${selected.has(a.id) ? "bg-primary/5" : ""}`}
                  onClick={() => selectMode && toggleSelect(a.id, i, (window.event as MouseEvent)?.shiftKey ?? false)}
                >
                  {selectMode && (
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selected.has(a.id)} readOnly className="h-4 w-4 accent-[var(--primary)]" />
                    </td>
                  )}
                  <td className="max-w-64 truncate px-4 py-2 text-ink">
                    <a href={`/api/assets/${a.id}`} target="_blank" rel="noreferrer" className="hover:underline">{a.filename}</a>
                  </td>
                  <td className="px-4 py-2 text-ink-muted">
                    {a.kind}
                    {a.rawArchivedAt && <a href="/dashboard/raw-vault" title="In RAW vault cold storage — restorable" className="ml-1.5 rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-400">❄ cold</a>}
                  </td>
                  <td className="px-4 py-2 text-ink-muted">{mb(a.bytes)}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[a.status] ?? ""}`}>{a.status}</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-ink-muted">{a.tags.join(", ") || "—"}</td>
                  <td className="px-4 py-2 text-xs text-ink-tertiary">{a.createdAt.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {feed.items.length === 0 && !loading && (
        <p className="py-8 text-center text-sm text-ink-subtle">
          {activeFilters ? "No files match these filters." : "No files yet — upload the shoot to get started."}
        </p>
      )}

      {feed.nextCursor && (
        <div className="flex justify-center">
          <Button size="sm" variant="outline" disabled={loading} onClick={() => void load(false)}>
            {loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}

      {triageOpen && (
        <TriageMode
          projectId={projectId}
          items={feed.items}
          onClose={() => setTriageOpen(false)}
          onDone={refresh}
        />
      )}
    </div>
  );
}

function TagInput({ disabled, onTag }: { disabled: boolean; onTag: (t: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <span className="flex items-center gap-1">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) {
            onTag(value.trim().toLowerCase());
            setValue("");
          }
        }}
        placeholder="add tag…"
        disabled={disabled}
        className="w-24 rounded-md border border-hairline bg-canvas px-2 py-1 text-xs text-ink outline-none focus:border-primary disabled:opacity-50"
      />
    </span>
  );
}
