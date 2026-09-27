"use client";

/* Project files workspace (Epic 8) — grid/list views with filters + sort +
 * keyset paging (WEB-120), tags (WEB-121), bulk selection + actions with
 * partial-failure reporting (WEB-128), and the upload queue: XHR progress,
 * bounded parallelism, retry/backoff, pause/resume, failure isolation
 * (WEB-113). Fast triage lives in <TriageMode> (WEB-122). */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ListFilter, X } from "lucide-react";

import { Button } from "@webcules/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@webcules/ui/components/dialog";
import { AssetViewer } from "@/components/asset-viewer";
import { useConfirm } from "@/components/confirm-provider";
import { TriageMode } from "@/components/triage-mode";

export type AssetItem = {
  id: string;
  filename: string;
  kind: string;
  status: string;
  bytes: number;
  mimeType: string;
  width: number | null;
  height: number | null;
  exifStripped: boolean;
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

/* Content fingerprint for duplicate detection — sha256 of the size plus the
 * first 1MB, so any file size hashes in bounded time. Server stores it on
 * the asset (asset.fingerprint) and the dedup-check endpoint compares. */
async function fingerprintFile(file: File): Promise<string | null> {
  try {
    const head = new Uint8Array(await file.slice(0, 1 << 20).arrayBuffer());
    const size = new TextEncoder().encode(`${file.size}:`);
    const combined = new Uint8Array(size.length + head.length);
    combined.set(size, 0);
    combined.set(head, size.length);
    const digest = await crypto.subtle.digest("SHA-256", combined);
    return "fp1:" + Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/* ---------------- Derivatives (WEB-116) ----------------
 * Generated in-browser with canvas right after an upload lands: thumb (320px)
 * + preview (1600px) JPEGs for images, poster frame for videos. Re-encoding
 * drops EXIF (orientation is baked in) so derivatives satisfy any strip
 * policy while originals stay untouched; RAW/HEIC (no browser decoder) and
 * failures simply serve the original. */

const DERIV_IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "avif", "gif"]);
const DERIV_VIDEO_EXTS = new Set(["mp4", "webm", "mov"]);

function canvasToBlob(bitmap: ImageBitmap | HTMLVideoElement, maxDim: number, quality: number): Promise<Blob | null> {
  const bw = bitmap instanceof HTMLVideoElement ? bitmap.videoWidth : bitmap.width;
  const bh = bitmap instanceof HTMLVideoElement ? bitmap.videoHeight : bitmap.height;
  if (!bw || !bh) return Promise.resolve(null);
  const scale = Math.min(1, maxDim / Math.max(bw, bh));
  const w = Math.max(1, Math.round(bw * scale));
  const h = Math.max(1, Math.round(bh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
}

async function uploadDerivative(assetId: string, kind: "thumb" | "preview", blob: Blob): Promise<boolean> {
  const form = new FormData();
  form.set("kind", kind);
  form.set("file", blob, `${kind}.jpg`);
  try {
    const res = await fetch(`/api/assets/${assetId}/derivative`, { method: "POST", body: form });
    return res.ok;
  } catch {
    return false;
  }
}

/** Grab a decodable video frame (~25% in, capped at 1s) as a bitmap. */
function videoFrame(file: File): Promise<ImageBitmap | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    const url = URL.createObjectURL(file);
    let settled = false;
    const done = (result: ImageBitmap | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(result);
    };
    video.onloadeddata = () => {
      try {
        video.currentTime = Math.min(1, (video.duration || 2) * 0.25);
      } catch {
        void createImageBitmap(video)
          .then(done, () => done(null));
      }
    };
    video.onseeked = () =>
      void createImageBitmap(video).then(done, () => done(null));
    video.onerror = () => done(null);
    setTimeout(() => done(null), 10_000); // codec support varies (HEVC mov) — give up, don't hang
    video.src = url;
  });
}

/** Best-effort derivatives for a finished upload; true when any landed. */
async function generateDerivatives(assetId: string, file: File): Promise<boolean> {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  try {
    if (DERIV_IMAGE_EXTS.has(ext)) {
      const bitmap = await createImageBitmap(file);
      const [thumb, preview] = await Promise.all([
        canvasToBlob(bitmap, 320, 0.82),
        canvasToBlob(bitmap, 1600, 0.85),
      ]);
      bitmap.close();
      let any = false;
      if (thumb) any = (await uploadDerivative(assetId, "thumb", thumb)) || any;
      if (preview) any = (await uploadDerivative(assetId, "preview", preview)) || any;
      return any;
    }
    if (DERIV_VIDEO_EXTS.has(ext)) {
      const frame = await videoFrame(file);
      if (!frame) return false;
      const thumb = await canvasToBlob(frame, 640, 0.82);
      frame.close();
      return thumb ? uploadDerivative(assetId, "thumb", thumb) : false;
    }
  } catch {
    return false;
  }
  return false;
}

export function ProjectFiles({ projectId, initial }: { projectId: string; initial?: AssetItem[] }) {
  const confirm = useConfirm();
  const [feed, setFeed] = useState<Feed>({ items: initial ?? [], nextCursor: null, counts: {}, tags: [] });
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState("date");
  const [filterOpen, setFilterOpen] = useState(false);
  // Bumped when upload derivatives land so grid <img> cache-bust to the
  // light ?variant=thumb rendering (WEB-116).
  const [derivVersion, setDerivVersion] = useState(0);
  // Which group's values are shown ("" = root group list) — Linear-style
  // drill-down instead of one long list of every option.
  const [filterGroup, setFilterGroup] = useState<"" | "status" | "kind" | "tag" | "sort">("");
  const filterRef = useRef<HTMLDivElement>(null);
  const filterCount = [status, kind, tag].filter(Boolean).length;

  // Close the filter popover on outside click / Escape; reset the drill-down.
  useEffect(() => {
    if (!filterOpen) return;
    function close() {
      setFilterOpen(false);
      setFilterGroup("");
    }
    function onDown(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [filterOpen]);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [loading, setLoading] = useState(false);

  // Detail viewer (WEB-119): index into feed.items, null = closed.
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  // Selection (WEB-128): click toggle, shift-range, clear.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const lastClicked = useRef<number>(-1);

  // Upload queue (WEB-113).
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueOpen, setQueueOpen] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [paused, setPaused] = useState(false);
  const filesPending = useRef<{ file: File; itemId: string }[]>([]);
  const activeXhrs = useRef<Map<string, Set<XMLHttpRequest>>>(new Map());
  const itemById = useRef<Map<string, QueueItem>>(new Map());
  const [triageOpen, setTriageOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [purging, setPurging] = useState(false);
  // Ids being deleted right now — cards dim + badge until the server replies.
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

  // Bulk rename (Files polish): base + running index over the selected set.
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameBase, setRenameBase] = useState("photo");
  const [renameStart, setRenameStart] = useState(1);
  const [renamePad, setRenamePad] = useState(2);
  const [renaming, setRenaming] = useState(false);

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
    // Deletion can take a moment on large selections — mark the affected
    // cards immediately so the action visibly registers.
    const isDelete = action === "delete";
    if (isDelete) {
      setDeleting(new Set(ids));
      setNotice(`Deleting ${ids.length} file${ids.length === 1 ? "" : "s"}…`);
    } else setNotice("");
    try {
      const res = await fetch("/api/assets/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, assetIds: ids, tag: tagValue }),
      });
      const body = (await res.json().catch(() => ({}))) as { done?: number; blocked?: { assetId: string }[] };
      const blocked = body.blocked?.length ?? 0;
      if (isDelete) {
        setNotice(
          blocked
            ? `Deleted ${body.done ?? 0} file${(body.done ?? 0) === 1 ? "" : "s"} · ${blocked} blocked (in an active client gallery)`
            : `Deleted ${body.done ?? 0} file${(body.done ?? 0) === 1 ? "" : "s"}.`,
        );
      } else {
        setNotice(
          blocked
            ? `${body.done ?? 0} done · ${blocked} blocked (in an active client gallery)`
            : `${body.done ?? 0} file${(body.done ?? 0) === 1 ? "" : "s"} updated`,
        );
      }
      setSelected(new Set());
      refresh();
    } catch {
      setNotice("Network error — try again.");
    }
    if (isDelete) setDeleting(new Set());
  }

  // "Delete rejected now" (WEB-123) — confirmation with the live count, then  // a deleted/skipped report (skipped = locked by an active client gallery).
  // Bulk rename (Files polish) — selected ids in grid order, preview of the
  // first few resulting names, extensions preserved server-side.
  function selectedInGridOrder(): AssetItem[] {
    return feed.items.filter((a) => selected.has(a.id));
  }
  function selectedExamples(): string[] {
    return selectedInGridOrder().slice(0, 3).map((a) => a.filename);
  }
  function renamePreview(base: string, start: number, pad: number, examples: string[]): string[] {
    return examples.map((name, i) => {
      const ext = name.includes(".") ? name.split(".").pop() : "";
      return `${base}${String(start + i).padStart(pad, "0")}${ext ? "." + ext : ""}`;
    });
  }
  async function applyRename() {
    const ids = selectedInGridOrder().map((a) => a.id);
    if (!ids.length || !renameBase.trim() || renaming) return;
    setRenaming(true);
    setNotice("");
    try {
      const res = await fetch("/api/assets/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename", assetIds: ids, base: renameBase.trim(), start: renameStart, pad: renamePad }),
      });
      const body = (await res.json().catch(() => ({}))) as { done?: number; error?: string };
      if (!res.ok) {
        setNotice(body.error === "invalid_base" ? "Pick a base name (letters, numbers, dashes)." : "Rename failed — try again.");
      } else {
        setNotice(`Renamed ${body.done ?? 0} file${(body.done ?? 0) === 1 ? "" : "s"}.`);
        setRenameOpen(false);
        refresh();
      }
    } catch {
      setNotice("Network error — try again.");
    }
    setRenaming(false);
  }

  async function purgeRejected() {
    const n = feed.counts.rejected ?? 0;
    if (!n || purging) return;
    if (
      !(await confirm({
        title: "Delete rejected files?",
        body: `Permanently delete ${n} rejected file${n === 1 ? "" : "s"} from this project now? Files in an active client gallery are skipped.`,
        destructive: true,
        confirmLabel: "Delete now",
      }))
    )
      return;
    setPurging(true);
    setNotice("");
    try {
      const res = await fetch(`/api/projects/${projectId}/assets/purge-rejected`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { deleted?: number; skipped?: number; error?: string };
      if (!res.ok) {
        setNotice(body.error === "not_found" ? "Project not found." : "Purge failed — try again.");
      } else {
        setNotice(
          body.skipped
            ? `Deleted ${body.deleted ?? 0} rejected file${(body.deleted ?? 0) === 1 ? "" : "s"} · ${body.skipped} skipped (in an active client gallery)`
            : `Deleted ${body.deleted ?? 0} rejected file${(body.deleted ?? 0) === 1 ? "" : "s"}.`,
        );
        refresh();
      }
    } catch {
      setNotice("Network error — try again.");
    }
    setPurging(false);
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

  /* ---------------- Upload queue (WEB-113; presigned WEB-111) ----------------
   * Bytes go browser→R2 directly: POST /api/uploads mints a session, the file
   * is PUT via presigned URL(s) (multipart above 100MB, parts in parallel),
   * and /api/uploads/confirm verifies + records the asset. Retries restart
   * the whole item (fresh presign); plan-gate and confirm rejections are
   * fatal and never retried. */

  const sessions = useRef<Map<string, string>>(new Map());
  const canceled = useRef<Set<string>>(new Set());

  const updateItem = useCallback((itemId: string, patch: Partial<QueueItem>) => {
    setQueue((q) => q.map((it) => (it.id === itemId ? { ...it, ...patch } : it)));
  }, []);

  /** XHR PUT with progress; resolves to the ETag response header. */
  const putBlob = useCallback(
    (itemId: string, url: string, blob: Blob, contentType: string | null, onLoaded: (loaded: number) => void) =>
      new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const set = activeXhrs.current.get(itemId) ?? new Set<XMLHttpRequest>();
        set.add(xhr);
        activeXhrs.current.set(itemId, set);
        const cleanup = () => {
          set.delete(xhr);
          if (!set.size) activeXhrs.current.delete(itemId);
        };
        xhr.open("PUT", url);
        if (contentType) xhr.setRequestHeader("Content-Type", contentType);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onLoaded(e.loaded);
        };
        xhr.onload = () => {
          cleanup();
          if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.getResponseHeader("ETag") ?? "");
          else reject(new Error(`HTTP ${xhr.status}`));
        };
        xhr.onerror = () => {
          cleanup();
          reject(new Error("network"));
        };
        xhr.onabort = () => {
          cleanup();
          reject(new Error("canceled"));
        };
        xhr.send(blob);
      }),
    [],
  );

  async function confirmUpload(assetId: string, etags?: string[], fingerprint?: string): Promise<void> {
    const res = await fetch("/api/uploads/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId, etags, fingerprint }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw { fatal: true, message: String(body.error ?? "confirm failed") };
    }
  }

  const startItem = useCallback(
    async (itemId: string, file: File, attempt: number) => {
      const backoff = Math.min(9000, 1000 * 3 ** attempt);
      updateItem(itemId, { state: "uploading", attempts: attempt + 1, error: undefined });
      let assetId: string | null = null;
      try {
        const res = await fetch("/api/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            filename: file.name,
            bytes: file.size,
            mimeType: file.type || "application/octet-stream",
          }),
        });
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) throw { fatal: true, message: String(body.error ?? `HTTP ${res.status}`) };
        assetId = String(body.assetId);
        sessions.current.set(itemId, assetId);

        if (body.mode === "multipart") {
          const partSize = Number(body.partSize);
          const urls = body.partUrls as string[];
          const etags: string[] = new Array(urls.length);
          const loaded = new Array(urls.length).fill(0);
          const report = () =>
            updateItem(itemId, { progress: Math.min(99, Math.round((loaded.reduce((a, b) => a + b, 0) / file.size) * 100)) });
          let nextPart = 0;
          const workers = Math.min(3, urls.length);
          await Promise.all(
            Array.from({ length: workers }, async () => {
              for (;;) {
                const i = nextPart++;
                if (i >= urls.length) return;
                const blob = file.slice(i * partSize, Math.min((i + 1) * partSize, file.size));
                etags[i] = await putBlob(itemId, urls[i], blob, null, (l) => {
                  loaded[i] = l;
                  report();
                });
              }
            }),
          );
          await confirmUpload(assetId, etags, fpStore.current.get(itemId));
        } else {
          const headers = body.headers as Record<string, string> | undefined;
          await putBlob(itemId, String(body.url), file, headers?.["Content-Type"] ?? null, (l) =>
            updateItem(itemId, { progress: Math.min(99, Math.round((l / file.size) * 100)) }),
          );
          await confirmUpload(assetId, undefined, fpStore.current.get(itemId));
        }
        sessions.current.delete(itemId);
        updateItem(itemId, { state: "done", progress: 100 });
        // WEB-116: derivatives are generated client-side after the original
        // lands — never gate the queue on them.
        if (assetId) {
          void generateDerivatives(assetId, file).then((any) => {
            if (any) setDerivVersion((v) => v + 1);
          });
        }
      } catch (err) {
        const e = err as { fatal?: boolean; message?: string };
        const message = e?.message ?? "upload failed";
        if (canceled.current.has(itemId)) {
          updateItem(itemId, { state: "canceled" });
        } else if (e?.fatal || attempt >= 3) {
          updateItem(itemId, { state: "failed", error: message });
          if (assetId) {
            void fetch("/api/uploads/abort", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ assetId }),
            }).catch(() => undefined);
            sessions.current.delete(itemId);
          }
        } else {
          updateItem(itemId, { state: "pending", progress: 0 });
          setTimeout(() => {
            if (itemById.current.has(itemId) && !canceled.current.has(itemId)) {
              void startItem(itemId, file, attempt + 1);
            }
          }, backoff);
        }
      }
      pump();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pump referenced at call time (defined below)
    [projectId, putBlob, updateItem],
  );

  const pump = useCallback(() => {
    if (paused || uploading) return;
    const activeCount = activeXhrs.current.size;
    let slots = UPLOAD_PARALLELISM - activeCount;
    while (slots > 0 && filesPending.current.length) {
      const next = filesPending.current.shift();
      if (!next) break;
      slots--;
      void startItem(next.itemId, next.file, itemById.current.get(next.itemId)?.attempts ?? 0);
    }
  }, [paused, uploading, startItem]);

  function cancelUploads() {
    for (const set of activeXhrs.current.values()) for (const xhr of set) xhr.abort();
    activeXhrs.current.clear();
    filesPending.current = [];
    for (const assetId of sessions.current.values()) {
      void fetch("/api/uploads/abort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId }),
      }).catch(() => undefined);
    }
    sessions.current.clear();
    for (const id of itemById.current.keys()) canceled.current.add(id);
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
      canceled.current.delete(it.id);
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
  // content fingerprint per queue item — sent at confirm so the asset row
  // carries it for future duplicate checks.
  const fpStore = useRef<Map<string, string>>(new Map());

  // Whole-tab drop target (Files polish): dropping anywhere on the tab
  // uploads instead of the browser navigating to the file. Depth-counted
  // dragenter/leave drives a full-viewport "Drop to upload" overlay.
  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);
  const enqueueRef = useRef(enqueueWithStore);
  enqueueRef.current = enqueueWithStore;
  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current++;
      setDragActive(true);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onLeave = () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragActive(false);
    };
    const onDrop = (e: DragEvent) => {
      dragDepth.current = 0;
      setDragActive(false);
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer?.files?.length) void enqueueRef.current(e.dataTransfer.files);
    };
    document.addEventListener("dragenter", onEnter);
    document.addEventListener("dragover", onOver);
    document.addEventListener("dragleave", onLeave);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragenter", onEnter);
      document.removeEventListener("dragover", onOver);
      document.removeEventListener("dragleave", onLeave);
      document.removeEventListener("drop", onDrop);
    };
  }, []);

  async function enqueueWithStore(files: FileList | File[]) {
    const arr = Array.from(files);
    if (!arr.length) return;
    // stash files for retry support
    const stash = arr.map((_, i) => `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`);
    stash.forEach((id, i) => fileStore.current.set(id, arr[i]));

    // Duplicate pre-check: fingerprint every file (bounded read), ask the
    // server which already exist in this project, offer to skip them.
    const fps = await Promise.all(arr.map((f) => fingerprintFile(f)));
    const skipIds = new Set<string>();
    const checkable = fps.filter((f): f is string => Boolean(f));
    if (checkable.length) {
      try {
        const res = await fetch(`/api/projects/${projectId}/assets/dedup-check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fingerprints: checkable }),
        });
        const body = (await res.json().catch(() => ({}))) as { duplicates?: { fingerprint: string; filename: string }[] };
        const dupFps = new Set((body.duplicates ?? []).map((d) => d.fingerprint));
        if (dupFps.size) {
          const dupNames = arr.filter((_, i) => fps[i] && dupFps.has(fps[i]!)).map((f) => f.name);
          const skip = await confirm({
            title: `${dupNames.length} duplicate file${dupNames.length === 1 ? "" : "s"}`,
            body: (
              <>
                Already in this project (identical content): <b className="text-ink">{dupNames.slice(0, 3).join(", ")}</b>
                {dupNames.length > 3 ? ` +${dupNames.length - 3} more` : ""}. Skip them, or cancel to upload everything anyway.
              </>
            ),
            confirmLabel: "Skip duplicates",
          });
          if (skip) arr.forEach((_, i) => { if (fps[i] && dupFps.has(fps[i]!)) skipIds.add(stash[i]); });
        }
      } catch {
        /* dedup check is advisory — network failure just uploads */
      }
    }

    const items: QueueItem[] = arr.map((file, i) => ({
      id: stash[i],
      name: file.name,
      size: file.size,
      progress: 0,
      state: skipIds.has(stash[i]) ? "canceled" : "pending",
      attempts: 0,
      error: skipIds.has(stash[i]) ? "Duplicate — skipped" : undefined,
    }));
    for (const it of items) itemById.current.set(it.id, it);
    for (let i = 0; i < arr.length; i++) {
      if (fps[i]) fpStore.current.set(stash[i], fps[i]!);
      if (!skipIds.has(stash[i])) filesPending.current.push({ file: arr[i], itemId: stash[i] });
    }
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
    const overallPct = queue.length ? Math.round(queue.reduce((n, q) => n + (q.state === "done" ? 100 : q.progress), 0) / queue.length) : 0;
    return { done, failed, total: queue.length, overallPct };
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

        <div className="relative" ref={filterRef}>
          <button
            type="button"
            onClick={() => {
              setFilterOpen((o) => !o);
              setFilterGroup("");
            }}
            className="flex items-center gap-1.5 rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-xs text-ink-muted transition-colors hover:bg-surface-2"
          >
            <ListFilter className="h-3.5 w-3.5" aria-hidden />
            Filter
            {filterCount > 0 && (
              <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-medium text-primary">{filterCount}</span>
            )}
            <ChevronDown className="h-3 w-3" aria-hidden />
          </button>
          {filterOpen && (
            <div className="absolute left-0 top-full z-40 mt-1.5 w-60 rounded-[10px] border border-hairline bg-surface-1 p-1 shadow-lg">
              {filterGroup === "" ? (
                <>
                  {(
                    [
                      { key: "status", label: "Status", current: status || "All statuses", has: Boolean(status), clear: () => setStatus("") },
                      { key: "kind", label: "Type", current: kind || "All types", has: Boolean(kind), clear: () => setKind("") },
                      { key: "tag", label: "Tags", current: tag || "All tags", has: Boolean(tag), clear: () => setTag("") },
                      {
                        key: "sort",
                        label: "Sort by",
                        current: sort === "name" ? "Name" : sort === "size" ? "Largest" : sort === "status" ? "Status" : "Newest",
                        has: sort !== "date",
                        clear: () => setSort("date"),
                      },
                    ] as const
                  ).map((g) => (
                    <div key={g.key} className="flex items-center">
                      <button
                        type="button"
                        onClick={() => setFilterGroup(g.key)}
                        className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-surface-2"
                      >
                        <span className="flex-1">
                          {g.label}
                          <span className="ml-1.5 text-[11px] text-ink-tertiary">{g.current}</span>
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 text-ink-tertiary" aria-hidden />
                      </button>
                      {g.has && (
                        <button
                          type="button"
                          onClick={g.clear}
                          aria-label={`Clear ${g.label.toLowerCase()} filter`}
                          className="ml-0.5 rounded p-1 text-ink-tertiary transition-colors hover:bg-surface-2 hover:text-ink"
                        >
                          <X className="h-3 w-3" aria-hidden />
                        </button>
                      )}
                    </div>
                  ))}
                  {filterCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setStatus("");
                        setKind("");
                        setTag("");
                      }}
                      className="mt-1 w-full rounded-md border-t border-hairline px-2 py-1.5 text-left text-[13px] text-ink-subtle transition-colors hover:bg-surface-2"
                    >
                      Clear filters
                    </button>
                  )}
                </>
              ) : (
                (() => {
                  const group =
                    filterGroup === "status"
                      ? {
                          title: "Status",
                          allLabel: "All statuses",
                          allValue: "",
                          current: status,
                          apply: (v: string) => setStatus(v),
                          options: STATUSES.map((s) => ({ value: s, label: s, count: counts[s] ?? 0 })),
                        }
                      : filterGroup === "kind"
                        ? {
                            title: "Type",
                            allLabel: "All types",
                            allValue: "",
                            current: kind,
                            apply: (v: string) => setKind(v),
                            options: KINDS.map((k) => ({ value: k, label: k, count: undefined })),
                          }
                        : filterGroup === "tag"
                          ? {
                              title: "Tags",
                              allLabel: "All tags",
                              allValue: "",
                              current: tag,
                              apply: (v: string) => setTag(v),
                              options: feed.tags.map((t) => ({ value: t.tag, label: t.tag, count: t.n })),
                            }
                          : {
                              title: "Sort by",
                              allLabel: "Default",
                              allValue: "date",
                              current: sort,
                              apply: (v: string) => setSort(v),
                              options: [
                                { value: "date", label: "Newest", count: undefined },
                                { value: "name", label: "Name", count: undefined },
                                { value: "size", label: "Largest", count: undefined },
                                { value: "status", label: "Status", count: undefined },
                              ],
                            };
                  const pick = (v: string) => {
                    group.apply(v);
                    setFilterGroup("");
                  };
                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => setFilterGroup("")}
                        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[13px] text-ink-subtle transition-colors hover:bg-surface-2"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                        {group.title}
                      </button>
                      <button
                        type="button"
                        onClick={() => pick(group.allValue)}
                        className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-[13px] text-ink-muted transition-colors hover:bg-surface-2"
                      >
                        <span className="flex-1">{group.allLabel}</span>
                        {(group.current === group.allValue || (!group.current && group.allValue === "")) && (
                          <Check className="h-3.5 w-3.5 text-ink-tertiary" aria-hidden />
                        )}
                      </button>
                      {group.options.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => pick(opt.value)}
                          className="flex w-full items-center rounded-md px-2 py-1.5 pl-4 text-left text-[13px] text-ink-muted transition-colors hover:bg-surface-2"
                        >
                          <span className="flex-1 capitalize">
                            {opt.label}
                            {opt.count !== undefined && opt.count > 0 && (
                              <span className="ml-1.5 text-[11px] text-ink-tertiary">{opt.count}</span>
                            )}
                          </span>
                          {group.current === opt.value && <Check className="h-3.5 w-3.5 text-ink-tertiary" aria-hidden />}
                        </button>
                      ))}
                    </>
                  );
                })()
              )}
            </div>
          )}
        </div>

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
          {(feed.counts.rejected ?? 0) > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={purging}
              onClick={() => void purgeRejected()}
              title="Permanently delete this project's rejected files now — files in an active client gallery are skipped"
            >
              {purging ? "Deleting…" : `Delete rejected (${feed.counts.rejected})`}
            </Button>
          )}
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
          e.stopPropagation(); // the document-level handler would enqueue again
          if (e.dataTransfer.files?.length) void enqueueWithStore(e.dataTransfer.files);
        }}
        className="rounded-[12px] border border-dashed border-hairline-strong bg-surface-1 p-4 text-center text-xs text-ink-subtle"
      >
        Drag & drop photos, videos, and RAWs here (up to 5 GB per file)
      </div>

      {notice && <p className="text-xs text-ink-muted">{notice}</p>}

      {/* Upload queue (WEB-113) — compact summary with overall progress;
       * the per-file list collapses and scrolls instead of growing the page. */}
      {queue.length > 0 && (
        <div className="flex flex-col gap-2 rounded-[12px] border border-hairline bg-surface-1 p-3">
          <div className="flex flex-wrap items-center gap-3 text-xs text-ink-subtle">
            <span className="shrink-0 font-medium text-ink">
              {uploading ? `Uploading ${summary.done + (uploading ? 1 : 0) > summary.total ? summary.total : summary.done}/${summary.total}` : `${summary.done}/${summary.total} uploaded`}
              {summary.failed ? ` · ${summary.failed} failed` : ""}
            </span>
            <div className="h-1.5 min-w-24 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={summary.overallPct} aria-valuemin={0} aria-valuemax={100}>
              <div
                className={`h-full rounded-full transition-[width] duration-300 ${summary.failed ? "bg-primary" : "bg-primary"}`}
                style={{ width: `${summary.overallPct}%` }}
              />
            </div>
            <span className="w-9 shrink-0 text-right tabular-nums text-ink-tertiary">{summary.overallPct}%</span>
            <div className="flex shrink-0 gap-1.5">
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
              <Button size="sm" variant="ghost" onClick={() => setQueueOpen((o) => !o)} aria-expanded={queueOpen}>
                {queueOpen ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
                {queueOpen ? "Hide" : "Files"}
              </Button>
            </div>
          </div>
          {queueOpen && (
            <div className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
              {queue.slice(-200).map((q) => (
                <div key={q.id} className="flex items-center gap-2 text-xs">
                  <span className="w-44 shrink-0 truncate text-ink-muted" title={`${q.name} (${mb(q.size)})${q.error ? ` — ${q.error}` : ""}`}>
                    {q.name} <span className="text-ink-tertiary">({mb(q.size)})</span>
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={`h-full transition-[width] ${q.state === "failed" ? "bg-destructive" : q.state === "done" ? "bg-success" : "bg-primary"}`}
                      style={{ width: `${q.state === "done" ? 100 : q.progress}%` }}
                    />
                  </div>
                  <span className={`w-24 shrink-0 text-right ${q.state === "failed" ? "text-destructive" : q.state === "done" ? "text-success-text" : q.state === "canceled" ? "text-ink-tertiary" : "text-ink-tertiary"}`}>
                    {q.state === "uploading" ? `${q.progress}%` : q.state === "pending" ? (q.attempts ? `retry ${q.attempts}` : "waiting") : q.state === "canceled" ? (q.error ? "skipped" : "canceled") : q.state}
                  </span>
                </div>
              ))}
            </div>
          )}
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
          <Button size="sm" variant="outline" disabled={!selected.size} onClick={() => setRenameOpen(true)}>Rename</Button>
          <Button size="sm" variant="ghost" disabled={!selected.size} onClick={() => void bulk("delete")}>Delete</Button>
        </div>
      )}

      <Dialog open={renameOpen} onOpenChange={(v) => !renaming && setRenameOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename {selected.size} file{selected.size === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription asChild>
              <div className="flex flex-col gap-3 text-sm text-ink-subtle">
                <p>
                  Numbers run in the current grid order. Extensions are kept.
                </p>
                <label className="flex flex-col gap-1">
                  Base name
                  <input
                    value={renameBase}
                    onChange={(e) => setRenameBase(e.target.value.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80))}
                    className="rounded-md border border-hairline bg-canvas px-2.5 py-2 text-sm text-ink"
                    placeholder="e.g. golden-hour"
                  />
                </label>
                <div className="flex gap-3">
                  <label className="flex flex-1 flex-col gap-1">
                    Start at
                    <input
                      type="number"
                      min={0}
                      max={999999}
                      value={renameStart}
                      onChange={(e) => setRenameStart(Math.max(0, Math.min(999999, Number(e.target.value) || 0)))}
                      className="rounded-md border border-hairline bg-canvas px-2.5 py-2 text-sm text-ink"
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-1">
                    Digits
                    <select
                      value={renamePad}
                      onChange={(e) => setRenamePad(Number(e.target.value))}
                      className="rounded-md border border-hairline bg-canvas px-2.5 py-2 text-sm text-ink"
                    >
                      {[1, 2, 3, 4, 5].map((d) => (
                        <option key={d} value={d}>{d} ({String(1).padStart(d, "0")})</option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="text-xs text-ink-tertiary">
                  Preview: {renamePreview(renameBase, renameStart, renamePad, selectedExamples()).join(", ")}
                  {selected.size > 3 ? ` … +${selected.size - 3}` : ""}
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={renaming} onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button disabled={renaming || !renameBase.trim() || !selected.size} onClick={() => void applyRename()}>
              {renaming ? "Renaming…" : `Rename ${selected.size}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grid view — CSS-columns masonry: each photo keeps its own aspect
       * so one tall image no longer stretches its whole row. */}
      {view === "grid" && (
        <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6 [&>*]:mb-3">
          {feed.items.map((a, i) => (
            <div
              key={a.id}
              className={`relative flex break-inside-avoid flex-col overflow-hidden rounded-[12px] border bg-surface-1 transition-opacity ${
                selected.has(a.id) ? "border-primary ring-1 ring-primary/40" : "border-hairline"
              } ${deleting.has(a.id) ? "opacity-40 saturate-50" : ""}`}
            >
              {deleting.has(a.id) && (
                <span className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-medium text-white">
                  Deleting…
                </span>
              )}
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
              <a
                href={`/api/assets/${a.id}`}
                target="_blank"
                rel="noreferrer"
                title={selectMode ? undefined : "Open in viewer"}
                className={`block bg-canvas ${selectMode ? "" : "cursor-zoom-in"}`}
                onClick={(e) => {
                  if (selectMode) e.preventDefault();
                  else {
                    e.preventDefault();
                    setViewerIndex(i);
                  }
                }}
              >
                {a.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- authorized proxy, no optimizer
                  <img
                    src={`/api/assets/${a.id}?variant=thumb${derivVersion ? `&v=${derivVersion}` : ""}`}
                    alt={a.filename}
                    loading="lazy"
                    className="block h-auto w-full object-cover"
                  />
                ) : (
                  <span className="flex h-32 w-full flex-col items-center justify-center gap-1 text-ink-tertiary">
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
                  className={`cursor-default transition-opacity ${selected.has(a.id) ? "bg-primary/5" : ""} ${deleting.has(a.id) ? "opacity-40" : ""}`}
                  onClick={() => selectMode && toggleSelect(a.id, i, (window.event as MouseEvent)?.shiftKey ?? false)}
                >
                  {selectMode && (
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selected.has(a.id)} readOnly className="h-4 w-4 accent-[var(--primary)]" />
                    </td>
                  )}
                  <td className="max-w-72 px-4 py-2 text-ink">
                    <div className="flex items-center gap-2.5">
                      {a.kind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element -- authorized proxy, no optimizer
                        <img
                          src={`/api/assets/${a.id}?variant=thumb${derivVersion ? `&v=${derivVersion}` : ""}`}
                          alt=""
                          loading="lazy"
                          className="h-9 w-9 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-[9px] uppercase text-ink-tertiary">{a.kind}</span>
                      )}
                      <a
                        href={`/api/assets/${a.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate hover:underline"
                        onClick={(e) => {
                          e.preventDefault();
                          setViewerIndex(i);
                        }}
                      >
                        {a.filename}
                      </a>
                      {deleting.has(a.id) && <span className="shrink-0 text-[10px] text-ink-tertiary">Deleting…</span>}
                    </div>
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

      {dragActive && (
        <div className="pointer-events-none fixed inset-0 z-[70] bg-primary/5">
          <div className="absolute inset-3 rounded-xl border-2 border-dashed border-primary/60 bg-surface-1/80 backdrop-blur-[1px]" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-hairline bg-surface-1 px-6 py-4 text-sm font-medium text-ink shadow-2xl">
            Drop files to upload
          </div>
        </div>
      )}

      <AssetViewer
        items={feed.items}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
        onClose={() => setViewerIndex(null)}
        derivVersion={derivVersion}
      />
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
