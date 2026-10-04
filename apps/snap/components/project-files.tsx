"use client";

/* Project files workspace (Epic 8) — grid/list views with filters + sort +
 * keyset paging (WEB-120), tags (WEB-121), bulk selection + actions with
 * partial-failure reporting (WEB-128), and the upload queue: XHR progress,
 * bounded parallelism, retry/backoff, pause/resume, failure isolation
 * (WEB-113). Fast triage lives in <TriageMode> (WEB-122). */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Check, ChevronDown, ChevronRight, ChevronUp, Folder, FolderPlus, Grid2x2, Grid3x3, ListFilter, Share2, Square, Upload, X, Zap } from "lucide-react";

import { Button } from "@webcules/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@webcules/ui/components/dialog";
import { AssetManage } from "@/components/asset-manage";
import { drawWatermark, loadWatermarkLogo } from "@/components/watermark-canvas";
import { colorKeyFromRgba } from "@/lib/color-sort";
import { FileTypeIcon } from "@/components/file-type-icon";
import { useConfirm } from "@/components/confirm-provider";
import { SharePanel } from "@/components/share-panel";
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
  /** Culling ratings (0023): stars 0-5, color 0-5. */
  stars: number;
  color: number;
  tags: string[];
  /** WEB-216: the folder this asset lives in (null = unfiled). */
  folderId: string | null;
  createdAt: string;
};

export type FolderItem = { id: string; name: string; count: number };

type Feed = {
  items: AssetItem[];
  nextCursor: string | null;
  counts: Record<string, number>;
  tags: { tag: string; n: number }[];
  ratings?: { stars: Record<string, number>; colors: Record<string, number> };
  folders?: FolderItem[];
  unfiledCount?: number;
};

/** color 0 = none, 1 red, 2 yellow, 3 green, 4 blue, 5 purple. */
const COLOR_HEX = ["#8a8f98", "#e5484d", "#f5d90a", "#46a758", "#3e63dd", "#8e4ec6"];
const COLOR_NAMES = ["None", "Red", "Yellow", "Green", "Blue", "Purple"];
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

/* ---------------- Watermark context (WEB-242) ----------------
 * Fetched once per dashboard mount: when the studio's watermark is on, new
 * uploads also generate a preview_wm derivative (browser canvas — the only
 * place watermark pixels are drawn). */

type WmContext = {
  config: { mode: "corner" | "tiled" | "text"; opacity: number; scale: number; margin: number; text?: string } | null;
  studioName: string;
  logoUrl: string | null;
};

let wmContextPromise: Promise<WmContext> | null = null;
function watermarkContext(): Promise<WmContext> {
  wmContextPromise ??= fetch("/api/studio/watermark")
    .then((r) => (r.ok ? (r.json() as Promise<WmContext>) : { config: null, studioName: "", logoUrl: null }))
    .catch(() => ({ config: null, studioName: "", logoUrl: null }));
  return wmContextPromise;
}

/* ---------------- Derivatives (WEB-116) ----------------
 * Generated in-browser with canvas right after an upload lands: thumb (320px)
 * + preview (1600px) JPEGs for images, poster frame for videos. Re-encoding
 * drops EXIF (orientation is baked in) so derivatives satisfy any strip
 * policy while originals stay untouched; RAW/HEIC (no browser decoder) and
 * failures simply serve the original. */

const DERIV_IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "avif", "gif", "bmp"]);
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

/** Rainbow-sort key from a 24x24 downsample (lib/color-sort.ts). */
function colorKeyOfBitmap(bitmap: ImageBitmap): number | undefined {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 24;
    canvas.height = 24;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return undefined;
    ctx.drawImage(bitmap, 0, 0, 24, 24);
    return colorKeyFromRgba(ctx.getImageData(0, 0, 24, 24).data);
  } catch {
    return undefined;
  }
}

/** WEB-242: preview canvas + watermark composite in one pass. */
async function canvasToBlobWatermarked(
  file: File,
  maxDim: number,
  quality: number,
  wm: { config: WmContext["config"]; logo: HTMLImageElement | null; studioName: string },
): Promise<Blob | null> {
  if (!wm.config) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    drawWatermark(ctx, { config: wm.config, logo: wm.logo, studioName: wm.studioName });
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
  } catch {
    return null;
  }
}

async function uploadDerivative(
  assetId: string,
  kind: "thumb" | "preview" | "preview_wm",
  blob: Blob,
  replace = false,
  meta?: { width?: number; height?: number; durationMs?: number; colorKey?: number },
): Promise<boolean> {
  const form = new FormData();
  form.set("kind", kind);
  form.set("file", blob, `${kind}.jpg`);
  if (replace) form.set("replace", "1");
  // WEB-260: report the decoder's intrinsic size (+ video duration) — the
  // server stores them set-if-null (cascade layouts, reels detection, labels).
  if (meta?.width) form.set("width", String(Math.round(meta.width)));
  if (meta?.height) form.set("height", String(Math.round(meta.height)));
  if (meta?.durationMs) form.set("durationMs", String(Math.round(meta.durationMs)));
  if (meta?.colorKey !== undefined) form.set("colorKey", String(meta.colorKey));
  try {
    const res = await fetch(`/api/assets/${assetId}/derivative`, { method: "POST", body: form });
    return res.ok;
  } catch {
    return false;
  }
}

/** Grab a decodable video frame (~25% in, capped at 1s) as a bitmap. */
type VideoMeta = { bitmap: ImageBitmap; width: number; height: number; durationMs: number | null };
function videoFrame(file: File): Promise<VideoMeta | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    const url = URL.createObjectURL(file);
    let settled = false;
    const done = (bitmap: ImageBitmap | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      // WEB-260: carry the decoder's dimensions + duration up to the caller.
      resolve(
        bitmap
          ? { bitmap, width: video.videoWidth, height: video.videoHeight, durationMs: Number.isFinite(video.duration) && video.duration > 0 ? video.duration * 1000 : null }
          : null,
      );
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
      const dims = { width: bitmap.width, height: bitmap.height, colorKey: colorKeyOfBitmap(bitmap) };
      bitmap.close();
      let any = false;
      if (thumb) any = (await uploadDerivative(assetId, "thumb", thumb, false, dims)) || any;
      if (preview) any = (await uploadDerivative(assetId, "preview", preview, false, dims)) || any;
      // WEB-242: watermarked preview for client galleries (best-effort —
      // the bulk regenerate action in Settings backfills any misses).
      const wm = await watermarkContext();
      if (preview && wm.config) {
        const logo = await loadWatermarkLogo(wm.logoUrl);
        const blob = await canvasToBlobWatermarked(file, 1600, 0.85, {
          config: wm.config,
          logo,
          studioName: wm.studioName,
        });
        if (blob) any = (await uploadDerivative(assetId, "preview_wm", blob)) || any;
      }
      return any;
    }
    if (DERIV_VIDEO_EXTS.has(ext)) {
      const frame = await videoFrame(file);
      if (!frame) return false;
      const thumb = await canvasToBlob(frame.bitmap, 640, 0.82);
      const colorKey = colorKeyOfBitmap(frame.bitmap);
      frame.bitmap.close();
      return thumb
        ? uploadDerivative(assetId, "thumb", thumb, false, {
            width: frame.width,
            height: frame.height,
            colorKey,
            ...(frame.durationMs ? { durationMs: frame.durationMs } : {}),
          })
        : false;
    }
  } catch {
    return false;
  }
  return false;
}

/* Video tile: poster frame at rest (the upload pipeline generates a JPEG
 * thumb for videos; without one it falls back to the original's first frame
 * via <video preload=metadata>), and plays muted inline on hover — a real
 * grid preview without leaving curation. */
function VideoTile({ id, hover }: { id: string; hover: boolean }) {
  const [noPoster, setNoPoster] = useState(false);
  const vref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = vref.current;
    if (!v) return;
    if (hover) void v.play().catch(() => undefined);
    else {
      v.pause();
      try {
        v.currentTime = 0.5;
      } catch { /* not seekable yet — fine */ }
    }
  }, [hover]);
  return (
    <span className="relative block h-full w-full">
      {!noPoster && !hover ? (
        // eslint-disable-next-line @next/next/no-img-element -- authorized proxy, no optimizer
        <img
          src={`/api/assets/${id}?variant=thumb`}
          alt=""
          loading="lazy"
          draggable={false}
          onError={() => setNoPoster(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        // eslint-disable-next-line jsx-a11y/media-has-caption -- muted hover preview
        <video ref={vref} src={`/api/assets/${id}#t=0.5`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
      )}
      <span aria-hidden className={`absolute inset-0 flex items-center justify-center transition-opacity ${hover ? "opacity-0" : "opacity-100"}`}>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
          <svg width="12" height="14" viewBox="0 0 14 16" fill="currentColor" aria-hidden><path d="M0 0l14 8-14 8z" /></svg>
        </span>
      </span>
    </span>
  );
}

export function ProjectFiles({ projectId, clientEmail, initial, defaultExpiryDays, defaultAllowDownload }: { projectId: string; clientEmail?: string; initial?: AssetItem[]; defaultExpiryDays?: number; defaultAllowDownload?: boolean }) {
  const confirm = useConfirm();
  const [feed, setFeed] = useState<Feed>({ items: initial ?? [], nextCursor: null, counts: {}, tags: [] });
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState("date");
  // WEB-216 folders: "" = all, "none" = unfiled, else folder id.
  const [folder, setFolder] = useState("");
  // Folder rail editing: which chip is an inline input (folder id | "new").
  const [folderEdit, setFolderEdit] = useState<string | null>(null);
  const [folderDraft, setFolderDraft] = useState("");
  // Folder chip highlighted while assets are dragged over it.
  const [dropFolder, setDropFolder] = useState<string | null>(null);
  // Bulk-bar "new folder + move" flow: inline input creates the folder and
  // immediately files the selection into it.
  const [moveNewOpen, setMoveNewOpen] = useState(false);
  const [moveNewDraft, setMoveNewDraft] = useState("");
  // Folder dropdown open (the rail is a compact Filter-style menu now).
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const folderMenuRef = useRef<HTMLDivElement>(null);
  // Share side panel (WEB-223): deliver approved/folders without leaving Files.
  const [shareOpen, setShareOpen] = useState(false);
  // Mobile actions menu (Select/Triage/Share/Upload live behind one button).
  const [actionsOpen, setActionsOpen] = useState(false);
  // Asset id whose video tile is hovered (plays inline).
  const [videoHover, setVideoHover] = useState<string | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  // Culling filters: rating ("unrated" | "1".."5" = ≥N), color ("none" | "1".."5").
  const [rating, setRating] = useState("");
  const [colorSel, setColorSel] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  // Bumped when upload derivatives land so grid <img> cache-bust to the
  // light ?variant=thumb rendering (WEB-116).
  const [derivVersion, setDerivVersion] = useState(0);
  // Which group's values are shown ("" = root group list) — Linear-style
  // drill-down instead of one long list of every option.
  const [filterGroup, setFilterGroup] = useState<"" | "status" | "kind" | "tag" | "sort" | "stars" | "color">("");
  const filterRef = useRef<HTMLDivElement>(null);
  const filterCount = [status, kind, tag, rating, colorSel].filter(Boolean).length;

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
  // Grid density (Midjourney organize-style): three levels — s = dense
  // contact sheet with square crops, m = default masonry, l = large review
  // tiles. Mobile (<640px) is always a fixed 4-column image-only grid, so
  // the class maps below only vary sm+ breakpoints — SSR markup stays
  // hydration-stable with no mount-effect dance.
  const [density, setDensity] = useState<"s" | "m" | "l">("m");
  useEffect(() => {
    const v = window.localStorage.getItem("snap-grid-density");
    if (v === "s" || v === "l") setDensity(v);
  }, []);
  useEffect(() => {
    window.localStorage.setItem("snap-grid-density", density);
  }, [density]);
  // Small density = pure image tiles: no meta row, hover-only controls.
  const compact = view === "grid" && density === "s";
  const micro = compact;

  // Manage pane (Midjourney-style): index into feed.items, null = grid.
  const [manageIndex, setManageIndex] = useState<number | null>(null);

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
  // WEB-265: per-photo interest heat (Studio+) — fetched lazily on toggle.
  const [heatOn, setHeatOn] = useState(false);
  const [heat, setHeat] = useState<Record<string, number> | null>(null);
  const heatMax = heat ? Math.max(1, ...Object.values(heat)) : 1;

  useEffect(() => {
    if (!heatOn || heat) return;
    fetch(`/api/projects/${projectId}/asset-views`)
      .then((r) => (r.ok ? (r.json() as Promise<{ views?: { assetId: string; views: number }[] }>) : Promise.resolve({})))
      .then((b: { views?: { assetId: string; views: number }[] }) => {
        const map: Record<string, number> = {};
        for (const v of b.views ?? []) map[v.assetId] = v.views;
        setHeat(map);
      })
      .catch(() => setHeat({}));
  }, [heatOn, heat, projectId]);
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
      if (rating) p.set("rating", rating);
      if (colorSel) p.set("color", colorSel);
      if (folder) p.set("folder", folder);
      if (cursor) p.set("cursor", cursor);
      return `/api/projects/${projectId}/assets?${p}`;
    },
    [projectId, status, kind, tag, sort, rating, colorSel, folder],
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
            ratings: page.ratings,
            folders: page.folders,
            unfiledCount: page.unfiledCount,
          }));
          // reflect view/filter in the URL (WEB-120)
          const url = new URL(window.location.href);
          url.searchParams.set("fv", view);
          if (status) url.searchParams.set("fs", status); else url.searchParams.delete("fs");
          if (kind) url.searchParams.set("fk", kind); else url.searchParams.delete("fk");
          if (rating) url.searchParams.set("fr", rating); else url.searchParams.delete("fr");
          if (colorSel) url.searchParams.set("fc", colorSel); else url.searchParams.delete("fc");
          if (folder) url.searchParams.set("ff", folder); else url.searchParams.delete("ff");
          window.history.replaceState(null, "", url);
        }
      } catch { /* keep previous page */ }
      setLoading(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- feed.nextCursor read on purpose
    [query, view, status, kind, folder],
  );

  // reload on filter/sort change; restore view + folder from the URL once on
  // mount (re-reading them on later runs would fight fresh state — the URL
  // only catches up after each load's replaceState).
  const urlRestored = useRef(false);
  useEffect(() => {
    if (!urlRestored.current) {
      urlRestored.current = true;
      const u = new URL(window.location.href);
      const v = u.searchParams.get("fv");
      if (v === "list" || v === "grid") setView(v);
      const f = u.searchParams.get("ff");
      if (f) setFolder(f);
    }
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on filter change
  }, [status, kind, tag, sort, rating, colorSel, folder]);

  const refresh = useCallback(() => void load(true), [load]);

  /* ---------------- Folders (WEB-216) ---------------- */

  const folders = feed.folders ?? [];
  const folderName = useCallback((id: string | null) => (id ? folders.find((f) => f.id === id)?.name ?? null : null), [folders]);

  /** Submit the rail's inline create/rename input. */
  async function submitFolderEdit() {
    const name = folderDraft.trim();
    const editing = folderEdit;
    setFolderEdit(null);
    setFolderDraft("");
    if (!name || !editing) return;
    try {
      const res =
        editing === "new"
          ? await fetch(`/api/projects/${projectId}/folders`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name }),
            })
          : await fetch(`/api/projects/${projectId}/folders/${editing}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name }),
            });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setNotice(body.error === "name_taken" ? `“${name}” already exists in this project.` : body.error === "too_many" ? "Folder limit reached (100 per project)." : "Couldn't save the folder — try again.");
      } else {
        refresh();
      }
    } catch {
      setNotice("Network error — try again.");
    }
  }

  async function deleteFolderClick(f: FolderItem) {
    if (!(await confirm({ title: `Delete “${f.name}”?`, body: `${f.count} file${f.count === 1 ? "" : "s"} fall back to Unfiled — nothing is deleted. Delivered galleries keep their folders.`, destructive: true, confirmLabel: "Delete folder" }))) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/folders/${f.id}`, { method: "DELETE" });
      if (!res.ok) {
        setNotice("Couldn't delete the folder — try again.");
        return;
      }
      if (folder === f.id) setFolder("");
      refresh();
    } catch {
      setNotice("Network error — try again.");
    }
  }

  /** Move explicit asset ids into a folder (null = unfiled) — one bulk call;
   * pointer moves only, bytes and locks never change. */
  async function moveIdsTo(ids: string[], target: string | null) {
    if (!ids.length) return;
    try {
      const res = await fetch("/api/assets/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "move", assetIds: ids, folderId: target }),
      });
      const body = (await res.json().catch(() => ({}))) as { done?: number };
      const label = target ? folderName(target) ?? "folder" : "Unfiled";
      setNotice(`Moved ${body.done ?? 0} file${(body.done ?? 0) === 1 ? "" : "s"} to ${label}.`);
      refresh();
    } catch {
      setNotice("Couldn't move — try again.");
    }
  }

  /** Drop handler for folder chips — accepts dragged asset ids (grid cards). */
  function folderDrop(e: React.DragEvent, target: string | null) {
    e.preventDefault();
    e.stopPropagation();
    setDropFolder(null);
    const raw = e.dataTransfer.getData("application/x-snap-assets");
    if (!raw) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      const ids = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
      void moveIdsTo(ids, target);
    } catch { /* not our payload */ }
  }

  /** Bulk-bar flow: create the folder, then file the selection into it. */
  async function createAndMoveSelection() {
    const name = moveNewDraft.trim();
    const ids = Array.from(selected);
    setMoveNewOpen(false);
    setMoveNewDraft("");
    if (!name || !ids.length) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !body.id) {
        setNotice(body.error === "name_taken" ? `“${name}” already exists in this project.` : "Couldn't create the folder — try again.");
        return;
      }
      setSelected(new Set());
      await moveIdsTo(ids, body.id);
    } catch {
      setNotice("Network error — try again.");
    }
  }

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
      // WEB-263: sneak-peek flags go through their own (Studio-gated) route.
      if (action === "peek-on" || action === "peek-off") {
        const res = await fetch("/api/assets/sneak-peek", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetIds: ids, on: action === "peek-on" }),
        });
        const body = (await res.json().catch(() => ({}))) as { updated?: number; error?: string };
        setNotice(
          res.ok
            ? `${body.updated ?? 0} photo${(body.updated ?? 0) === 1 ? "" : "s"} ${action === "peek-on" ? "flagged as a first look" : "back to normal"}`
            : body.error === "sneak_peeks_require_studio"
              ? "Sneak peeks are a Studio feature."
              : "Couldn't update — try again.",
        );
        setSelected(new Set());
        refresh();
        return;
      }
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
  /* ---------------- Culling (WEB-209 P0) ----------------
   * Optimistic single-asset rating/flagging + keyboard roving focus.
   * Ratings skip the audit log on purpose (high-frequency, low-risk). */
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [autoAdvance, setAutoAdvance] = useState(false);

  function patchLocal(id: string, patch: Partial<AssetItem>) {
    setFeed((f) => ({ ...f, items: f.items.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  }

  async function rateAsset(id: string, patch: { stars?: number; color?: number }) {
    const before = feed.items.find((a) => a.id === id);
    patchLocal(id, patch);
    try {
      for (const key of ["stars", "color"] as const) {
        if (patch[key] === undefined) continue;
        const res = await fetch(`/api/assets/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: key, value: patch[key] }),
        });
        if (!res.ok) throw new Error(String(res.status));
      }
    } catch {
      if (before) patchLocal(id, { stars: before.stars, color: before.color });
      setNotice("Couldn't save rating — try again.");
    }
  }

  async function flagAsset(id: string, action: "approve" | "reject" | "reset") {
    const before = feed.items.find((a) => a.id === id);
    const to = action === "approve" ? "approved" : action === "reject" ? "rejected" : "uploaded";
    patchLocal(id, { status: to });
    try {
      const res = await fetch(`/api/assets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      if (before) patchLocal(id, { status: before.status });
      setNotice("Couldn't update status — try again.");
    }
  }

  async function toggleFavorite(id: string) {
    const a = feed.items.find((x) => x.id === id);
    if (!a) return;
    const has = a.tags.includes("favorite");
    patchLocal(id, { tags: has ? a.tags.filter((t) => t !== "favorite") : [...a.tags, "favorite"] });
    try {
      await fetch("/api/assets/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: has ? "untag" : "tag", assetIds: [id], tag: "favorite" }),
      });
    } catch {
      patchLocal(id, { tags: a.tags });
    }
  }

  /** Single-asset tag add/remove for the manage pane — one bulk-styled call. */
  async function tagAsset(id: string, tag: string, add: boolean) {
    const a = feed.items.find((x) => x.id === id);
    if (!a || (!add && !a.tags.includes(tag))) return;
    patchLocal(id, { tags: add ? (a.tags.includes(tag) ? a.tags : [...a.tags, tag]) : a.tags.filter((t) => t !== tag) });
    try {
      await fetch("/api/assets/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: add ? "tag" : "untag", assetIds: [id], tag }),
      });
    } catch {
      patchLocal(id, { tags: a.tags });
    }
  }

  /* Spatial arrow navigation. The masonry grids are CSS multi-columns, which
   * lay out column-major — plain index±1 walked DOWN a column and jumped to
   * the next one's top (a nightmare on long lists). Instead, read the
   * rendered card rects and build visual columns (left-aligned stacks); then
   * left/right move to the nearest card in the adjacent column and up/down
   * move within the current column. Works for every density, no layout
   * change. */
  function spatialCells(): { i: number; top: number; left: number; h: number }[] {
    return [...document.querySelectorAll<HTMLElement>("[data-asset-idx]")]
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { i: Number(el.getAttribute("data-asset-idx")), left: r.left, top: r.top, h: r.height };
      })
      .filter((c) => Number.isFinite(c.i))
      .sort((a, b) => a.top - b.top || a.left - b.left);
  }

  function groupColumns(cells: { i: number; top: number; left: number }[]): { i: number; top: number }[][] {
    const cols: { i: number; top: number }[][] = [];
    let col: { i: number; top: number }[] = [];
    let colLeft = -Infinity;
    for (const c of cells) {
      if (col.length && Math.abs(c.left - colLeft) > 24) {
        cols.push(col);
        col = [];
      }
      if (!col.length) colLeft = c.left;
      col.push(c);
    }
    if (col.length) cols.push(col);
    return cols;
  }

  function nearestToTop(col: { i: number; top: number }[], top: number): number {
    let best = col[0].i;
    let bestD = Infinity;
    for (const c of col) {
      const d = Math.abs(c.top - top);
      if (d < bestD) {
        bestD = d;
        best = c.i;
      }
    }
    return best;
  }

  function moveFocus(delta: 1 | -1, axis: "x" | "y" = "x") {
    setFocusIndex((cur) => {
      const cells = spatialCells();
      if (!cells.length) return null;
      const cols = groupColumns(cells);
      const maxH = cells.reduce((m, c) => Math.max(m, c.h), 0);
      const tol = Math.max(20, maxH * 0.5); // row-band tolerance (masonry offsets)
      if (cur === null) return delta > 0 ? cells[0].i : cells[cells.length - 1].i;

      let ci = 0;
      let ri = -1;
      let top = 0;
      for (let c = 0; c < cols.length && ri === -1; c++) {
        const idx = cols[c].findIndex((cell) => cell.i === cur);
        if (idx !== -1) {
          ci = c;
          ri = idx;
          top = cols[c][idx].top;
        }
      }
      if (ri === -1) return cells[0].i; // focused card not rendered — reset to first

      if (axis === "y") {
        const r = ri + delta;
        if (r >= 0 && r < cols[ci].length) return cols[ci][r].i;
        return cur; // column edge — stay put so page scroll stays natural
      }

      const nextCol = cols[ci + delta];
      if (nextCol) return nearestToTop(nextCol, top);

      // Horizontal edge: step to the adjacent visual ROW in reading order —
      // right = first (leftmost) card of the row below; left = last card of
      // the row above. Wrap across the board only when there is no such row.
      if (delta > 0) {
        const below = cells.filter((c) => c.top > top + tol);
        if (!below.length) return cells[0].i;
        const rowTop = below.reduce((m, c) => Math.min(m, c.top), Infinity);
        const row = cells.filter((c) => Math.abs(c.top - rowTop) <= tol);
        return row.reduce((l, c) => (c.left < l.left ? c : l), row[0]).i;
      }
      const above = cells.filter((c) => c.top < top - tol);
      if (!above.length) return cells[cells.length - 1].i;
      const rowTop = above.reduce((m, c) => Math.max(m, c.top), -Infinity);
      const row = cells.filter((c) => Math.abs(c.top - rowTop) <= tol);
      return row.reduce((r, c) => (c.left > r.left ? c : r), row[0]).i;
    });
  }

  // keep the focused card in view
  useEffect(() => {
    if (focusIndex === null) return;
    document.querySelector(`[data-asset-idx="${focusIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [focusIndex]);

  // keyboard culling — active in the grid when no overlay/dialog owns the keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof Element && t.closest("input, textarea, select, [contenteditable]")) return;
      if (renameOpen || triageOpen || manageIndex !== null || dragActive) return;
      if (document.querySelector('[role="dialog"]')) return;
      const k = e.key.toLowerCase();

      if (k === "a") {
        setAutoAdvance((v) => !v);
        return;
      }

      // Selection mode: number keys rate the whole selection in one call.
      if (selectMode && selected.size > 0) {
        const ids = feed.items.filter((x) => selected.has(x.id)).map((x) => x.id);
        if (/^[0-5]$/.test(k)) {
          e.preventDefault();
          void fetch("/api/assets/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "stars", assetIds: ids, value: Number(k) }),
          }).then(() => refresh());
          return;
        }
        if (/^[6-9]$/.test(k)) {
          e.preventDefault();
          void fetch("/api/assets/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "color", assetIds: ids, value: Number(k) - 5 }),
          }).then(() => refresh());
          return;
        }
        if (k === "p") { e.preventDefault(); void bulk("approve"); return; }
        if (k === "x") { e.preventDefault(); void bulk("reject"); return; }
        return;
      }

      // Grid culling on the focused card (first action key focuses card 0).
      if (e.key === "ArrowRight") { e.preventDefault(); moveFocus(1, "x"); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); moveFocus(-1, "x"); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); moveFocus(1, "y"); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); moveFocus(-1, "y"); return; }
      const idx = focusIndex ?? 0;
      const item = feed.items[idx];
      if (!item) return;
      const act = (fn: () => void | Promise<void>) => {
        e.preventDefault();
        setFocusIndex(idx);
        void fn();
        if (autoAdvance) moveFocus(1);
      };
      if (k === "p") return act(() => flagAsset(item.id, "approve"));
      if (k === "x") return act(() => flagAsset(item.id, "reject"));
      if (k === "u") return act(() => flagAsset(item.id, "reset"));
      if (k === "f") return act(() => toggleFavorite(item.id));
      if (k === "v" || e.key === "Enter") { e.preventDefault(); setFocusIndex(idx); setManageIndex(idx); return; }
      if (/^[0-5]$/.test(k)) return act(() => rateAsset(item.id, { stars: Number(k) }));
      if (/^[6-9]$/.test(k)) {
        const c = Number(k) - 5;
        return act(() => rateAsset(item.id, { color: item.color === c ? 0 : c }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- closures read latest render values
  });

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
        if (!res.ok) {
          let message = String(body.error ?? `HTTP ${res.status}`);
          // Plan-gate failures read as reasons, not codes (kind rides at the
          // top level — the route spreads the gate's extra into the body).
          if (body.error === "plan_type_restricted") {
            message = body.kind === "raw"
              ? "RAW trial full (3 GB on Free) — Lite unlocks unlimited RAW"
              : "Video uploads need a paid plan — Free covers JPG and the 3 GB RAW trial";
          } else if (body.error === "storage_locked") {
            message = "Storage limit reached — upgrade to keep uploading";
          } else if (body.error === "upload_rate_bound") {
            message = "Monthly upload limit reached — resets next month";
          }
          throw { fatal: true, message };
        }
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
  // Launch fix: drags that START inside this page (grid thumbnails, links)
  // never upload — some browsers expose an in-page image drag as a File
  // (the rendered derivative bytes), which fingerprint dedup can't catch
  // and produced duplicate uploads.
  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);
  const internalDrag = useRef(false);
  const enqueueRef = useRef(enqueueWithStore);
  enqueueRef.current = enqueueWithStore;
  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onDragStart = () => {
      internalDrag.current = true;
    };
    const onDragEnd = () => {
      internalDrag.current = false;
    };
    const onEnter = (e: DragEvent) => {
      if (internalDrag.current || !hasFiles(e)) return;
      dragDepth.current++;
      setDragActive(true);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e) && !internalDrag.current) e.preventDefault();
    };
    const onLeave = () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragActive(false);
    };
    const onDrop = (e: DragEvent) => {
      dragDepth.current = 0;
      setDragActive(false);
      if (internalDrag.current) {
        // Swallow the drop so the browser doesn't navigate to the image.
        e.preventDefault();
        return;
      }
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer?.files?.length) void enqueueRef.current(e.dataTransfer.files);
    };
    document.addEventListener("dragstart", onDragStart, true);
    document.addEventListener("dragend", onDragEnd, true);
    document.addEventListener("dragenter", onEnter);
    document.addEventListener("dragover", onOver);
    document.addEventListener("dragleave", onLeave);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragstart", onDragStart, true);
      document.removeEventListener("dragend", onDragEnd, true);
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
  const activeFilters = Boolean(status || kind || tag || rating || colorSel);
  /* Day groups (Midjourney organize-style): date-sorted contiguous items
   * share one bordered mosaic block with a date header, so the outline
   * hugs the first/last images of each group. Non-date sorts render as a
   * single unbordered grid. */
  const groups = useMemo(() => {
    const flat = feed.items.map((a, i) => ({ a, i }));
    if (sort !== "date") return [{ key: "all", label: "", entries: flat }];
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const fmtDay = (key: string) =>
      key === today ? "Today" : key === yesterday ? "Yesterday" : new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const out: { key: string; label: string; entries: { a: AssetItem; i: number }[] }[] = [];
    for (const e of flat) {
      const key = e.a.createdAt.slice(0, 10);
      const last = out[out.length - 1];
      if (last && last.key === key) last.entries.push(e);
      else out.push({ key, label: fmtDay(key), entries: [e] });
    }
    return out;
  }, [feed.items, sort]);

  const summary = useMemo(() => {
    const done = queue.filter((q) => q.state === "done").length;
    const failed = queue.filter((q) => q.state === "failed").length;
    const overallPct = queue.length ? Math.round(queue.reduce((n, q) => n + (q.state === "done" ? 100 : q.progress), 0) / queue.length) : 0;
    return { done, failed, total: queue.length, overallPct };
  }, [queue]);

  /* Filter menu (hierarchical): root rows + flyout submenus. */
  const FILTER_ROOT = [
    { key: "status" as const, label: "Status", current: status || "All", has: Boolean(status), clear: () => setStatus("") },
    { key: "kind" as const, label: "Type", current: kind || "All", has: Boolean(kind), clear: () => setKind("") },
    { key: "tag" as const, label: "Tags", current: tag || "All", has: Boolean(tag), clear: () => setTag("") },
    { key: "stars" as const, label: "Stars", current: rating ? (rating === "unrated" ? "Unrated" : `${rating}+`) : "Any", has: Boolean(rating), clear: () => setRating("") },
    { key: "color" as const, label: "Color", current: colorSel ? (colorSel === "none" ? "None" : COLOR_NAMES[Number(colorSel)]) : "Any", has: Boolean(colorSel), clear: () => setColorSel("") },
    {
      key: "sort" as const,
      label: "Sort by",
      current: sort === "name" ? "Name" : sort === "size" ? "Largest" : sort === "status" ? "Status" : "Newest",
      has: sort !== "date",
      clear: () => setSort("date"),
    },
  ];

  function filterGroupDef(key: "status" | "kind" | "tag" | "stars" | "color" | "sort") {
    if (key === "status")
      return {
        allLabel: "All statuses",
        allValue: "",
        current: status,
        apply: (v: string) => setStatus(v),
        options: STATUSES.map((s) => ({ value: s, label: s, count: counts[s] ?? 0 })),
      };
    if (key === "kind")
      return {
        allLabel: "All types",
        allValue: "",
        current: kind,
        apply: (v: string) => setKind(v),
        options: KINDS.map((k) => ({ value: k, label: k, count: undefined })),
      };
    if (key === "tag")
      return {
        allLabel: "All tags",
        allValue: "",
        current: tag,
        apply: (v: string) => setTag(v),
        options: feed.tags.map((t) => ({ value: t.tag, label: t.tag, count: t.n })),
      };
    if (key === "stars")
      return {
        allLabel: "Any rating",
        allValue: "",
        current: rating,
        apply: (v: string) => setRating(v),
        options: [
          { value: "unrated", label: "Unrated", count: Number(feed.ratings?.stars["0"] ?? 0) },
          ...[5, 4, 3, 2, 1].map((n) => ({
            value: String(n),
            label: `${"★".repeat(n)} ${n}+`,
            count: Object.entries(feed.ratings?.stars ?? {}).reduce((acc, [k, c]) => (Number(k) >= n ? acc + c : acc), 0),
          })),
        ],
      };
    if (key === "color")
      return {
        allLabel: "Any color",
        allValue: "",
        current: colorSel,
        apply: (v: string) => setColorSel(v),
        options: [
          { value: "none", label: "No label", count: Number(feed.ratings?.colors["0"] ?? 0) },
          ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: COLOR_NAMES[n], count: Number(feed.ratings?.colors[String(n)] ?? 0) })),
        ],
      };
    return {
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
  }

  /* ---------------- Render ---------------- */

  // Close the mobile actions menu on outside click / Escape.
  useEffect(() => {
    if (!actionsOpen) return;
    function onDown(e: MouseEvent) {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) setActionsOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setActionsOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [actionsOpen]);

  // Close the folder dropdown on outside click / Escape.
  useEffect(() => {
    if (!folderMenuOpen) return;
    function onDown(e: MouseEvent) {
      if (folderMenuRef.current && !folderMenuRef.current.contains(e.target as Node)) setFolderMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFolderMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [folderMenuOpen]);

  // Manage pane swap (Midjourney-style): replaces the whole tab body —
  // inline layout, no modal, no fullscreen mode.
  if (manageIndex !== null && feed.items.length > 0) {
    return (
      <AssetManage
        items={feed.items}
        index={Math.min(manageIndex, feed.items.length - 1)}
        onIndexChange={setManageIndex}
        onClose={() => setManageIndex(null)}
        derivVersion={derivVersion}
        onFlag={(id, action) => void flagAsset(id, action)}
        onRate={(id, patch) => void rateAsset(id, patch)}
        onFavorite={(id) => void toggleFavorite(id)}
        onTag={(id, tag, add) => void tagAsset(id, tag, add)}
        folders={folders}
        onMove={(id, folderId) => void moveIdsTo([id], folderId)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar — mobile keeps only the essentials (Filter · Select · Triage
       * · Share · Upload); density/view toggles, Auto-advance and the purge
       * button are desktop controls (no keyboard, no hover on touch). */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-[12px] border border-hairline bg-surface-1 p-2 sm:gap-2 sm:p-3">
        <div className="mr-2 hidden text-sm text-ink-subtle sm:block">
          {Object.values(counts).reduce((a, b) => a + b, 0)} file{Object.values(counts).reduce((a, b) => a + b, 0) === 1 ? "" : "s"}
          {counts.approved ? ` · ${counts.approved} approved` : ""}
          {counts.rejected ? ` · ${counts.rejected} rejected` : ""}
          {counts.shared ? ` · ${counts.shared} shared` : ""}
        </div>

      {/* Folder dropdown (WEB-216/223) — same pattern as Filter: one compact
       * trigger (with a folder icon before created folder names) instead of a
       * chip rail that ate toolbar space. Rows filter the feed and accept
       * dragged cards; folders are free on every tier. */}
      <div className="relative shrink-0" ref={folderMenuRef}>
        <button
          type="button"
          onClick={() => setFolderMenuOpen((o) => !o)}
          aria-expanded={folderMenuOpen}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
            folder
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-hairline bg-canvas text-ink-muted hover:bg-surface-2"
          }`}
        >
          <Folder className="h-3.5 w-3.5" aria-hidden />
          <span className="max-w-40 truncate">
            {folder === "none" ? `Unfiled${feed.unfiledCount ? ` · ${feed.unfiledCount}` : ""}` : folder ? `${folderName(folder) ?? "Folder"}${(() => { const f = folders.find((x) => x.id === folder); return f ? ` · ${f.count}` : ""; })()}` : "All files"}
          </span>
          <ChevronDown className="h-3 w-3" aria-hidden />
        </button>
        {folderMenuOpen && (
          <div className="absolute left-0 top-full z-40 mt-1.5 w-64 rounded-[10px] border border-hairline bg-surface-1 p-1 shadow-lg" role="menu" aria-label="Folders">
            <button
              type="button"
              role="menuitem"
              onClick={() => { setFolder(""); setFolderMenuOpen(false); }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-2 ${folder === "" ? "text-ink" : "text-ink-muted"}`}
            >
              <Folder className="h-3.5 w-3.5 text-ink-tertiary" aria-hidden />
              <span className="flex-1">All files</span>
              {folder === "" && <Check className="h-3.5 w-3.5 text-ink-tertiary" aria-hidden />}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setFolder("none"); setFolderMenuOpen(false); }}
              onDragOver={(e) => { if (e.dataTransfer.types.includes("application/x-snap-assets")) { e.preventDefault(); setDropFolder("none"); } }}
              onDragLeave={() => setDropFolder((d) => (d === "none" ? null : d))}
              onDrop={(e) => folderDrop(e, null)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-2 ${
                dropFolder === "none" ? "ring-2 ring-primary" : ""
              } ${folder === "none" ? "text-ink" : "text-ink-muted"}`}
            >
              <span className="flex-1">Unfiled{feed.unfiledCount ? ` · ${feed.unfiledCount}` : ""}</span>
              {folder === "none" && <Check className="h-3.5 w-3.5 text-ink-tertiary" aria-hidden />}
            </button>
            {folders.length > 0 && <div className="my-1 border-t border-hairline" />}
            {folders.map((f) => (
              <div key={f.id} className="group/frow flex items-center">
                {folderEdit === f.id ? (
                  <input
                    autoFocus
                    value={folderDraft}
                    onChange={(e) => setFolderDraft(e.target.value)}
                    onBlur={() => void submitFolderEdit()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submitFolderEdit();
                      if (e.key === "Escape") { setFolderEdit(null); setFolderDraft(""); }
                    }}
                    aria-label="Rename folder"
                    className="my-1 w-full rounded-md border border-primary bg-canvas px-2 py-1 text-xs text-ink outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setFolder(f.id); setFolderMenuOpen(false); }}
                    onDragOver={(e) => { if (e.dataTransfer.types.includes("application/x-snap-assets")) { e.preventDefault(); setDropFolder(f.id); } }}
                    onDragLeave={() => setDropFolder((d) => (d === f.id ? null : d))}
                    onDrop={(e) => folderDrop(e, f.id)}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-2 ${
                      dropFolder === f.id ? "ring-2 ring-primary" : ""
                    } ${folder === f.id ? "text-ink" : "text-ink-muted"}`}
                  >
                    <Folder className="h-3.5 w-3.5 shrink-0 text-ink-tertiary" aria-hidden />
                    <span className="flex-1 truncate">
                      {f.name} <span className="text-[11px] text-ink-tertiary">· {f.count}</span>
                    </span>
                    {folder === f.id && <Check className="h-3.5 w-3.5 shrink-0 text-ink-tertiary" aria-hidden />}
                  </button>
                )}
                {folderEdit !== f.id && (
                  <span className="ml-0.5 hidden shrink-0 items-center group-hover/frow:inline-flex">
                    <button
                      type="button"
                      aria-label={`Rename ${f.name}`}
                      onClick={() => { setFolderEdit(f.id); setFolderDraft(f.name); }}
                      className="rounded p-0.5 text-ink-tertiary hover:text-ink"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${f.name}`}
                      onClick={() => void deleteFolderClick(f)}
                      className="rounded p-0.5 text-ink-tertiary hover:text-destructive"
                    >
                      <X className="h-3 w-3" aria-hidden />
                    </button>
                  </span>
                )}
              </div>
            ))}
            <div className="my-1 border-t border-hairline" />
            {folderEdit === "new" ? (
              <input
                autoFocus
                value={folderDraft}
                onChange={(e) => setFolderDraft(e.target.value)}
                onBlur={() => void submitFolderEdit()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitFolderEdit();
                  if (e.key === "Escape") { setFolderEdit(null); setFolderDraft(""); }
                }}
                aria-label="New folder name"
                placeholder="Folder name"
                className="my-1 w-full rounded-md border border-primary bg-canvas px-2 py-1 text-xs text-ink outline-none"
              />
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => { setFolderEdit("new"); setFolderDraft(""); }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-ink-tertiary transition-colors hover:bg-surface-2 hover:text-primary"
              >
                <FolderPlus className="h-3.5 w-3.5" aria-hidden />
                New folder
              </button>
            )}
          </div>
        )}
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
              {FILTER_ROOT.map((g) => {
                const def = filterGroupDef(g.key);
                return (
                  <div key={g.key} className="relative" onMouseEnter={() => filterOpen && setFilterGroup(g.key)}>
                    <div className="flex items-center">
                      <button
                        type="button"
                        onClick={() => setFilterGroup(filterGroup === g.key ? "" : g.key)}
                        aria-expanded={filterGroup === g.key}
                        className={`flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-2 ${
                          filterGroup === g.key ? "text-ink" : "text-ink-muted"
                        }`}
                      >
                        <span className="flex-1 truncate">
                          {g.label}
                          {g.has && <span className="ml-1.5 text-[11px] text-primary">{g.current}</span>}
                        </span>
                        <ChevronRight className={`h-3.5 w-3.5 text-ink-tertiary transition-transform ${filterGroup === g.key ? "rotate-90" : ""}`} aria-hidden />
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
                    {filterGroup === g.key && (
                      <div className="absolute left-[calc(100%+6px)] top-0 z-50 w-56 rounded-[10px] border border-hairline bg-surface-1 p-1 shadow-lg">
                        <button
                          type="button"
                          onClick={() => { def.apply(def.allValue); setFilterOpen(false); setFilterGroup(""); }}
                          className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-[13px] text-ink-muted transition-colors hover:bg-surface-2"
                        >
                          <span className="flex-1">{def.allLabel}</span>
                          {(def.current === def.allValue || (!def.current && def.allValue === "")) && <Check className="h-3.5 w-3.5 text-ink-tertiary" aria-hidden />}
                        </button>
                        {def.options.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => { def.apply(opt.value); setFilterOpen(false); setFilterGroup(""); }}
                            className="flex w-full items-center rounded-md px-2 py-1.5 pl-3 text-left text-[13px] text-ink-muted transition-colors hover:bg-surface-2"
                          >
                            <span className="flex-1 capitalize">
                              {opt.label}
                              {opt.count !== undefined && opt.count > 0 && (
                                <span className="ml-1.5 text-[11px] text-ink-tertiary">{opt.count}</span>
                              )}
                            </span>
                            {def.current === opt.value && <Check className="h-3.5 w-3.5 text-ink-tertiary" aria-hidden />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {filterCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setStatus("");
                    setKind("");
                    setTag("");
                    setRating("");
                    setColorSel("");
                  }}
                  className="mt-1 w-full rounded-md border-t border-hairline px-2 py-1.5 text-left text-[13px] text-ink-subtle transition-colors hover:bg-surface-2"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          <div className="hidden items-center gap-1.5 md:flex">
            {view === "grid" && (
              <div className="flex overflow-hidden rounded-md border border-hairline" role="group" aria-label="Grid size">
                {([
                  ["s", Grid3x3, "Small — dense contact sheet"],
                  ["m", Grid2x2, "Medium — balanced masonry"],
                  ["l", Square, "Large — review tiles"],
                ] as const).map(([d, Icon, title]) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDensity(d)}
                    aria-pressed={density === d}
                    title={title}
                    aria-label={title}
                    className={`px-2 py-1.5 transition-colors ${density === d ? "bg-primary/10 text-primary" : "text-ink-tertiary hover:bg-surface-2 hover:text-ink-muted"}`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </button>
                ))}
              </div>
            )}
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
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAutoAdvance((v) => !v)}
              title="Keyboard culling: ←/→ focus · P approve · X reject · U reset · 0-5 stars · 6-9 color labels · F favorite · V open viewer · A toggles auto-advance"
            >
              {autoAdvance ? "Auto ⏩ on" : "Auto ⏩ off"}
            </Button>
          </div>
          <div className="hidden items-center gap-1.5 sm:flex">
            <Button size="sm" variant="outline" onClick={() => { setSelectMode((s) => !s); setSelected(new Set()); }}>
              {selectMode ? "Done" : "Select"}
            </Button>
            <Button size="sm" variant="outline" disabled={!feed.items.length} onClick={() => setTriageOpen(true)}>
              Triage
            </Button>
            <Button size="sm" variant={heatOn ? "default" : "outline"} disabled={!feed.items.length} onClick={() => setHeatOn((v) => !v)} title="Heat: which photos your client looked at most (Studio)">
              {heatOn ? "Heat on" : "Heat"}
            </Button>
          </div>
          {(feed.counts.rejected ?? 0) > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={purging}
              className="hidden sm:inline-flex"
              onClick={() => void purgeRejected()}
              title="Permanently delete this project's rejected files now — files in an active client gallery are skipped"
            >
              {purging ? "Deleting…" : `Delete rejected (${feed.counts.rejected})`}
            </Button>
          )}
          <div className="hidden items-center gap-1.5 sm:flex">
            <Button size="sm" variant="outline" disabled={!(counts.approved || counts.shared) && !folders.length} onClick={() => setShareOpen(true)} title="Send a secure gallery link to the client — approved files or specific folders">
              <Share2 className="h-3.5 w-3.5 sm:mr-1" aria-hidden />
              <span className="hidden sm:inline">Share</span>
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,.avif,.heic,.gif,.bmp,.mp4,.mov,.webm,.lrf,.tif,.tiff,.psd,.psb,.ai,.eps,.aep,.pdf,.svg,.mp3,.wav,.cr2,.cr3,.nef,.arw,.dng,.rwl,.lfr"
              className="hidden"
              onChange={(e) => e.target.files?.length && enqueueWithStore(e.target.files)}
            />
            <Button size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? "Uploading…" : "Upload"}
            </Button>
          </div>

          {/* Mobile: one Actions button instead of the four desktop controls. */}
          <div className="relative sm:hidden" ref={actionsRef}>
            <button
              type="button"
              onClick={() => setActionsOpen((o) => !o)}
              aria-expanded={actionsOpen}
              aria-label="Actions"
              className="flex items-center gap-1 rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-xs text-ink-muted transition-colors hover:bg-surface-2"
            >
              <Zap className="h-3.5 w-3.5" aria-hidden />
              Actions
              <ChevronDown className="h-3 w-3" aria-hidden />
            </button>
            {actionsOpen && (
              <div className="absolute right-0 top-full z-40 mt-1.5 w-48 rounded-[10px] border border-hairline bg-surface-1 p-1 shadow-lg" role="menu" aria-label="Actions">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setSelectMode((x) => !x); setSelected(new Set()); setActionsOpen(false); }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] text-ink-muted transition-colors hover:bg-surface-2"
                >
                  <Square className="h-4 w-4" aria-hidden />
                  {selectMode ? "Done selecting" : "Select"}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!feed.items.length}
                  onClick={() => { setTriageOpen(true); setActionsOpen(false); }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] text-ink-muted transition-colors hover:bg-surface-2 disabled:opacity-50"
                >
                  <Zap className="h-4 w-4" aria-hidden />
                  Triage
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!(counts.approved || counts.shared) && !folders.length}
                  onClick={() => { setShareOpen(true); setActionsOpen(false); }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] text-ink-muted transition-colors hover:bg-surface-2 disabled:opacity-50"
                >
                  <Share2 className="h-4 w-4" aria-hidden />
                  Share with client
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={uploading}
                  onClick={() => { setActionsOpen(false); inputRef.current?.click(); }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] text-ink-muted transition-colors hover:bg-surface-2 disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" aria-hidden />
                  {uploading ? "Uploading…" : "Upload"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation(); // the document-level handler would enqueue again
          if (internalDrag.current) return; // in-page drags never upload
          if (e.dataTransfer.files?.length) void enqueueWithStore(e.dataTransfer.files);
        }}
        className="hidden rounded-[12px] border border-dashed border-hairline-strong bg-surface-1 p-4 text-center text-xs text-ink-subtle sm:block"
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
                <div key={q.id} className="flex min-w-0 items-center gap-2 text-xs">
                  <span className="w-28 shrink-0 truncate text-ink-muted sm:w-44" title={`${q.name} (${mb(q.size)})${q.error ? ` — ${q.error}` : ""}`}>
                    {q.name} <span className="text-ink-tertiary">({mb(q.size)})</span>
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={`h-full transition-[width] ${q.state === "failed" ? "bg-destructive" : q.state === "done" ? "bg-success" : "bg-primary"}`}
                      style={{ width: `${q.state === "done" ? 100 : q.progress}%` }}
                    />
                  </div>
                  <span className={`w-16 shrink-0 text-right sm:w-24 ${q.state === "failed" ? "text-destructive" : q.state === "done" ? "text-success-text" : "text-ink-tertiary"}`}>
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
          <Button size="sm" variant="outline" disabled={!selected.size} onClick={() => void bulk("peek-on")} title="A first look on the client home before the gallery opens (Studio)">Sneak peek</Button>
          <Button size="sm" variant="ghost" disabled={!selected.size} onClick={() => void bulk("peek-off")} title="Remove the sneak-peek flag">Un-peek</Button>
          <TagInput disabled={!selected.size} onTag={(t) => void bulk("tag", t)} />
          <span className="relative">
            <select
              aria-label="Move selection to folder"
              disabled={!selected.size}
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                if (v === "__new") setMoveNewOpen(true);
                else {
                  void moveIdsTo(Array.from(selected), v === "__none" ? null : v);
                  setSelected(new Set());
                }
              }}
              className="snap-select h-8 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink-muted outline-none disabled:opacity-50"
            >
              <option value="">Move to…</option>
              <option value="__none">Unfiled</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
              <option value="__new">+ New folder…</option>
            </select>
          </span>
          {moveNewOpen && (
            <input
              autoFocus
              value={moveNewDraft}
              onChange={(e) => setMoveNewDraft(e.target.value)}
              onBlur={() => { setMoveNewOpen(false); setMoveNewDraft(""); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createAndMoveSelection();
                if (e.key === "Escape") { setMoveNewOpen(false); setMoveNewDraft(""); }
              }}
              aria-label="New folder name"
              placeholder="Folder name + Enter"
              className="w-40 rounded-md border border-primary bg-canvas px-2 py-1 text-xs text-ink outline-none"
            />
          )}
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
                      className="snap-select rounded-md border border-hairline bg-canvas px-2.5 py-2 text-sm text-ink"
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

      {/* Grid view (Midjourney organize-style) — day-grouped masonry blocks:
       * each group's outline hugs its first/last images, mobile is always a
       * fixed 4-column image-only grid, and density picks the sm+ column
       * count (s = square contact sheet, m/l = natural-ratio masonry). */}
      {view === "grid" &&
        groups.map((g) => (
          <section key={g.key} aria-label={g.label || "All files"} className="flex flex-col gap-1.5">
            {g.label && (
              <div className="flex items-baseline gap-2 px-0.5 pt-1">
                <h3 className="text-xs font-medium text-ink-muted">{g.label}</h3>
                <span className="text-[11px] text-ink-tertiary">
                  {g.entries.length} file{g.entries.length === 1 ? "" : "s"}
                </span>
              </div>
            )}
            <div className={`overflow-hidden rounded-[10px] border border-hairline ${compact ? "p-0.5" : "p-0.5 sm:p-1"}`}>
              <div
                className={
                  density === "s"
                    ? "columns-4 gap-0.5 sm:columns-6 sm:gap-1 md:columns-8 lg:columns-10 [&>*]:mb-0.5 sm:[&>*]:mb-1"
                    : density === "m"
                      ? "columns-4 gap-1 sm:columns-4 sm:gap-2 md:columns-5 [&>*]:mb-1 sm:[&>*]:mb-2"
                      : "columns-4 gap-1 sm:columns-2 sm:gap-3 lg:columns-3 [&>*]:mb-1 sm:[&>*]:mb-3"
                }
              >
                {g.entries.map(({ a, i }) => (
                  <div
                    key={a.id}
                    data-asset-idx={i}
                    draggable={!selectMode}
                    onDragStart={(e) => {
                      // Dragging a selected card carries the whole selection.
                      const ids = selected.has(a.id) ? Array.from(selected) : [a.id];
                      e.dataTransfer.setData("application/x-snap-assets", JSON.stringify(ids));
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className={`group relative flex break-inside-avoid flex-col transition-opacity ${
                      compact
                        ? `overflow-hidden rounded-[4px] ${selected.has(a.id) ? "ring-2 ring-primary" : focusIndex === i ? "ring-2 ring-primary/70" : ""}`
                        : // m/l: just the image — the hover popover carries the meta
                          `rounded-[4px] sm:rounded-none ${selected.has(a.id) ? "ring-2 ring-primary" : focusIndex === i ? "ring-2 ring-primary/70" : ""}`
                    } ${deleting.has(a.id) ? "opacity-40 saturate-50" : ""}`}
                  >
                    {heatOn && heat && heat[a.id] ? (
                      <span
                        className="pointer-events-none absolute bottom-1 left-1 z-20 rounded px-1.5 py-0.5 text-[9px] font-bold text-white"
                        style={{ background: `rgba(225,29,72,${0.35 + 0.65 * Math.min(1, heat[a.id] / heatMax)})` }}
                        title={`${heat[a.id]} view${heat[a.id] === 1 ? "" : "s"}`}
                      >
                        {heat[a.id]}
                      </span>
                    ) : null}
                    {deleting.has(a.id) && (
                      <span className="absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-medium text-white">
                        Deleting…
                      </span>
                    )}
                    {selectMode && (
                      <input
                        type="checkbox"
                        checked={selected.has(a.id)}
                        onClick={(e) => { e.stopPropagation(); toggleSelect(a.id, i, e.shiftKey); }}
                        onChange={() => undefined}
                        className="absolute left-1.5 top-1.5 z-20 h-4 w-4 accent-[var(--primary)]"
                        aria-label={`Select ${a.filename}`}
                      />
                    )}
                    <a
                      href={`/api/assets/${a.id}`}
                      target="_blank"
                      rel="noreferrer"
                      draggable={false}
                      title={selectMode ? undefined : "Manage this file"}
                      className={`relative block ${compact ? "bg-canvas" : ""} ${selectMode ? "" : "cursor-zoom-in"}`}
                      onMouseEnter={() => a.kind === "video" && setVideoHover(a.id)}
                      onMouseLeave={() => setVideoHover((v) => (v === a.id ? null : v))}
                      onClick={(e) => {
                        if (selectMode) e.preventDefault();
                        else {
                          e.preventDefault();
                          setManageIndex(i);
                        }
                      }}
                    >
                      {a.kind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element -- authorized proxy, no optimizer
                        <img
                          src={`/api/assets/${a.id}?variant=thumb${derivVersion ? `&v=${derivVersion}` : ""}`}
                          alt={a.filename}
                          loading="lazy"
                          draggable={false}
                          className={`block w-full object-cover ${compact ? "aspect-square" : "aspect-square sm:aspect-auto"}`}
                        />
                      ) : a.kind === "video" ? (
                        <span className={`block w-full ${compact ? "aspect-square" : "aspect-square sm:aspect-auto"}`}>
                          <VideoTile id={a.id} hover={videoHover === a.id} />
                        </span>
                      ) : (
                        <span className={`flex w-full items-center justify-center bg-surface-2/60 ${compact ? "aspect-square" : "aspect-square sm:min-h-32"}`}>
                          <FileTypeIcon kind={a.kind} filename={a.filename} className="h-8 w-8" />
                        </span>
                      )}
                      {/* image-only indicators (small density + mobile):
                         * overlays on the image, never card chrome */}
                      {a.status === "rejected" && (
                        <span className={`absolute inset-0 z-[5] bg-canvas/45 `} aria-hidden />
                      )}
                      {a.status === "approved" && (
                        <span className={`absolute inset-x-0 bottom-0 z-[5] h-[3px] bg-emerald-500 `} aria-hidden />
                      )}
                      {a.color > 0 && (
                        <span className={`absolute inset-y-0 left-0 z-[5] w-[3px] `} style={{ background: COLOR_HEX[a.color] }} aria-hidden />
                      )}
                      {a.stars > 0 && (
                        <span className={`absolute right-1 top-1 z-[6] rounded-full bg-black/55 px-1.5 py-0.5 text-[9px] font-medium leading-none text-amber-400 `}>
                          {"★".repeat(a.stars)}
                        </span>
                      )}
                      {a.tags.includes("favorite") && (
                        <span className={`absolute left-1 top-1 z-[6] text-[10px] leading-none text-amber-400 drop-shadow `} aria-hidden>
                          ♥
                        </span>
                      )}
                      {compact && (
                        <span className="pointer-events-none absolute inset-x-7 top-1 z-10 truncate rounded bg-black/55 px-1.5 py-0.5 text-[9px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                          {a.filename}
                        </span>
                      )}
                      {!compact && (
                        <span className="pointer-events-none absolute inset-x-2 top-1.5 z-10 truncate rounded bg-black/55 px-1.5 py-0.5 text-[9px] text-white opacity-0 transition-opacity group-hover:opacity-0 sm:group-hover:opacity-100">
                          {a.filename}
                        </span>
                      )}
                      {/* hover quick actions (culling without leaving the grid).
                       * Buttons reflect live state: ✓ stays emerald once
                       * approved, ✕ red once rejected, ♥ amber when favorite. */}
                      {!selectMode && (
                        <div className={`pointer-events-none absolute z-20 flex items-center gap-1 rounded-lg bg-black/60 px-1.5 py-1 opacity-0 backdrop-blur-sm transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 ${micro ? "inset-x-1 bottom-1" : "inset-x-1.5 bottom-1.5"}`}>
                          <span className="mr-0.5 hidden text-[9px] font-medium uppercase tracking-wide text-white/60 sm:inline" aria-hidden>
                            {a.status === "shared" ? "shared" : a.status === "approved" ? "approved" : a.status === "rejected" ? "rejected" : ""}
                          </span>
                          <button type="button" title="Reject (X)" aria-label={`Reject ${a.filename}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); void flagAsset(a.id, "reject"); }} className={`rounded p-0.5 ${a.status === "rejected" ? "text-red-400" : "text-white/80 hover:text-red-400"}`}>✕</button>
                          <button type="button" title="Approve (P)" aria-label={`Approve ${a.filename}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); void flagAsset(a.id, "approve"); }} className={`rounded p-0.5 ${a.status === "approved" || a.status === "shared" ? "text-emerald-400" : "text-white/80 hover:text-emerald-400"}`}>✓</button>
                          <button type="button" title="Favorite (F)" aria-label={`Favorite ${a.filename}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); void toggleFavorite(a.id); }} className={`rounded p-0.5 ${a.tags.includes("favorite") ? "text-amber-400" : "text-white/80 hover:text-amber-300"}`}>♥</button>
                          {!micro && (
                          <span className="ml-1 flex items-center" role="group" aria-label={`Rate ${a.filename}`}>
                            {[1, 2, 3, 4, 5].map((n) => (
                              <button
                                key={n}
                                type="button"
                                title={`${n} star${n > 1 ? "s" : ""} (${n})`}
                                aria-label={`Rate ${a.filename} ${n} stars`}
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); void rateAsset(a.id, { stars: a.stars === n ? 0 : n }); }}
                                className={`px-[1px] text-[11px] leading-none ${n <= a.stars ? "text-amber-400" : "text-white/45 hover:text-white/80"}`}
                              >
                                ★
                              </button>
                            ))}
                          </span>
                          )}
                          {!micro && (
                          <button
                            type="button"
                            title={`Color: ${COLOR_NAMES[a.color]} — cycles (6–9 keys)`}
                            aria-label={`Cycle color label for ${a.filename}`}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); void rateAsset(a.id, { color: (a.color + 1) % 6 }); }}
                            className="ml-auto flex items-center gap-1 rounded p-0.5 text-[9px] text-white/70 hover:text-white"
                          >
                            <span aria-hidden className="h-2.5 w-2.5 rounded-full border border-white/40" style={{ background: a.color ? COLOR_HEX[a.color] : "transparent" }} />
                          </button>
                          )}
                        </div>
                      )}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))}

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
                <th className="px-4 py-2.5 font-medium">Rating</th>
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
                          draggable={false}
                          className="h-9 w-9 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-2">
                          <FileTypeIcon kind={a.kind} filename={a.filename} className="h-4.5 w-4.5" badge={false} />
                        </span>
                      )}
                      <a
                        href={`/api/assets/${a.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate hover:underline"
                        onClick={(e) => {
                          e.preventDefault();
                          setManageIndex(i);
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
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-1.5 text-xs">
                      {a.stars > 0 && <span className="text-amber-500" title={`${a.stars} stars`}>{"★".repeat(a.stars)}</span>}
                      {a.color > 0 && <span aria-hidden title={COLOR_NAMES[a.color]} className="h-2 w-2 rounded-full" style={{ background: COLOR_HEX[a.color] }} />}
                      {a.stars === 0 && a.color === 0 && <span className="text-ink-tertiary">—</span>}
                    </span>
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
          {folder === "none"
            ? "No unfiled files — everything lives in a folder."
            : folder
              ? `No files in ${folderName(folder) ?? "this folder"} yet — select files and use “Move to…”, or drag cards onto the folder chip.`
              : activeFilters
                ? "No files match these filters."
                : "No files yet — upload the shoot to get started."}
        </p>
      )}

      {feed.nextCursor && (
        <div className="flex justify-center">
          <Button size="sm" variant="outline" disabled={loading} onClick={() => void load(false)}>
            {loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}

      {shareOpen && (
        <SharePanel
          projectId={projectId}
          clientEmail={clientEmail}
          approvedCount={(counts.approved ?? 0) + (counts.shared ?? 0)}
          defaultExpiryDays={defaultExpiryDays}
          defaultAllowDownload={defaultAllowDownload}
          onClose={() => setShareOpen(false)}
        />
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
