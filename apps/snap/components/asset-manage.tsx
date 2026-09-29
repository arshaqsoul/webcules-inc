"use client";

/* Manage pane (Midjourney-style, WEB-209) — replaces the old modal viewer
 * AND its fullscreen mode entirely. Rendered inline where the grid was:
 * desktop = large image + right-hand actions/metadata panel + a thumbnail
 * filmstrip rail that doubles as the scrollbar. Mobile (<lg) = Midjourney
 * app layout: thumbnail strip on top (scrolling it scrubs the main image),
 * swipe left/right on the image to navigate, and a bottom bar with quick
 * actions + summary that expands — tap or swipe up — into a sheet holding
 * the full options/metadata panel. Deliberately NOT a dialog: no overlay,
 * no aria-modal, no scroll lock for the pane itself; the tab body swaps to
 * this layout and swaps back on close/Escape. */
import { useCallback, useEffect, useRef, useState } from "react";

import { Check, ChevronUp, Heart, Star, X } from "lucide-react";

import type { AssetItem } from "@/components/project-files";
import { FileTypeIcon } from "@/components/file-type-icon";

type Exif = { make?: string; model?: string; taken?: string } | null;

/** color 0 = none, 1 red, 2 yellow, 3 green, 4 blue, 5 purple (mirrors project-files). */
const COLOR_HEX = ["#8a8f98", "#e5484d", "#f5d90a", "#46a758", "#3e63dd", "#8e4ec6"];
const COLOR_NAMES = ["None", "Red", "Yellow", "Green", "Blue", "Purple"];

const STATUS_BADGE: Record<string, string> = {
  uploaded: "bg-surface-2 text-ink-subtle",
  approved: "bg-success/10 text-success-text",
  rejected: "bg-destructive/10 text-destructive",
  shared: "bg-primary/10 text-primary",
};

function mb(bytes: number): string {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/* Compact client EXIF read (Make/Model/DateTime) for kept-metadata JPEGs —
 * pulls only the leading 256 KB where the IFDs live. */
async function readExif(url: string): Promise<Exif> {
  try {
    const res = await fetch(url, { headers: { Range: "bytes=0-262143" } });
    if (!res.ok && res.status !== 206) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length < 12 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    let off = 2;
    let tiff = -1;
    while (off + 4 <= buf.length) {
      if (buf[off] !== 0xff) break;
      const marker = buf[off + 1];
      const size = (buf[off + 2] << 8) | buf[off + 3];
      if (marker === 0xe1 && size > 8) {
        const exifHead = String.fromCharCode(...buf.slice(off + 4, off + 10));
        if (exifHead === "Exif\u0000\u0000") {
          tiff = off + 10;
          break;
        }
      }
      off += 2 + size;
    }
    if (tiff < 0 || tiff + 8 > buf.length) return null;
    const le = buf[tiff] === 0x49 && buf[tiff + 1] === 0x49;
    const s16 = (p: number) => (le ? buf[p + 1] << 8 : buf[p] << 8) | (le ? buf[p] : buf[p + 1]);
    const s32 = (p: number) =>
      le
        ? (buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16) | (buf[p + 3] << 24)) >>> 0
        : ((buf[p] << 24) | (buf[p + 1] << 16) | (buf[p + 2] << 8) | (buf[p + 3])) >>> 0;
    const readIfd = (ifd: number): Record<number, string> => {
      const out: Record<number, string> = {};
      if (ifd + 2 > buf.length) return out;
      const count = s16(ifd);
      for (let i = 0; i < count && ifd + 2 + i * 12 + 12 <= buf.length; i++) {
        const e = ifd + 2 + i * 12;
        const tag = s16(e);
        const type = s16(e + 2);
        const n = s32(e + 4);
        const sizes: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
        const bytesLen = (sizes[type] ?? 1) * n;
        const voff = bytesLen <= 4 ? e + 8 : tiff + s32(e + 8);
        if (type === 2 && voff + n <= buf.length) {
          let s = "";
          for (let c = 0; c < n - 1 && buf[voff + c] !== 0; c++) s += String.fromCharCode(buf[voff + c]);
          out[tag] = s.trim();
        } else if (type === 3 && voff + 2 <= buf.length) {
          out[tag] = String(s16(voff));
        }
      }
      return out;
    };
    const ifd0 = readIfd(tiff + s32(tiff + 4));
    let exifIfdTags: Record<number, string> = {};
    if (ifd0[0x8769]) exifIfdTags = readIfd(tiff + Number(ifd0[0x8769]));
    const make = ifd0[0x010f];
    const model = ifd0[0x0110];
    const taken = exifIfdTags[0x9003] ?? ifd0[0x0132];
    if (!make && !model && !taken) return null;
    return { make, model, taken };
  } catch {
    return null;
  }
}

export function AssetManage({
  items,
  index,
  onIndexChange,
  onClose,
  derivVersion,
  onFlag,
  onRate,
  onFavorite,
  onTag,
  folders,
  onMove,
}: {
  items: AssetItem[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  derivVersion?: number;
  onFlag: (id: string, action: "approve" | "reject" | "reset") => void;
  onRate: (id: string, patch: { stars?: number; color?: number }) => void;
  onFavorite: (id: string) => void;
  /** add = true tags, false untags — single-asset bulk call. */
  onTag: (id: string, tag: string, add: boolean) => void;
  /** WEB-216: file this asset into a folder (null = unfiled). */
  folders?: { id: string; name: string }[];
  onMove?: (id: string, folderId: string | null) => void;
}) {
  const [exif, setExif] = useState<Exif>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  // Lightbox (zoom modal): opened by clicking the preview; clicking the
  // image toggles zoom at the click point, backdrop click / Escape closes
  // back to this manage layout.
  const [lightbox, setLightbox] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomOrigin, setZoomOrigin] = useState("center");
  const item = items[index];

  // Mobile gestures (Midjourney-style): swipe on the image steps prev/next,
  // scrolling the filmstrip scrubs the active index, and the bottom bar
  // expands into the options/metadata sheet on tap or swipe-up.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [swipeDx, setSwipeDx] = useState(0);
  const swipe = useRef<{ x: number; y: number; dx: number } | null>(null);
  const swipedAt = useRef(0);
  const stripRef = useRef<HTMLDivElement>(null);
  const scrubUntil = useRef(0);
  const scrubRaf = useRef(0);
  const barTouchY = useRef(0);
  const sheetTouchY = useRef(0);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    swipe.current = { x: t.clientX, y: t.clientY, dx: 0 };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = swipe.current;
    if (!s) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x;
    if (Math.abs(dx) > Math.abs(t.clientY - s.y)) {
      s.dx = dx;
      setSwipeDx(dx * 0.35);
    }
  };
  const onTouchEnd = () => {
    const s = swipe.current;
    swipe.current = null;
    setSwipeDx(0);
    if (s && Math.abs(s.dx) > 12) swipedAt.current = Date.now();
    if (s && Math.abs(s.dx) > 56) step(s.dx < 0 ? 1 : -1);
  };
  // A swipe should not also register as the tap that opens the lightbox.
  const tappedAfterSwipe = () => Date.now() - swipedAt.current < 300;

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!items.length) return;
      onIndexChange((index + dir + items.length) % items.length);
    },
    [index, items.length, onIndexChange],
  );

  // per-asset state reset + neighbor preload for snappy stepping
  useEffect(() => {
    setExif(null);
    setDims(null);
    setTagDraft("");
    setZoom(1);
    if (!item) return;
    for (const d of [1, -1]) {
      const n = items[(index + d + items.length) % items.length];
      if (n && n !== item && n.kind === "image") {
        const img = new Image();
        img.src = `/api/assets/${n.id}?variant=preview${derivVersion ? `&v=${derivVersion}` : ""}`;
      }
    }
    if (!item.exifStripped && item.mimeType === "image/jpeg") {
      void readExif(`/api/assets/${item.id}`).then(setExif);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- item identity is the trigger
  }, [item?.id]);

  // keep the active filmstrip thumb in view (the rail IS the scroller) —
  // suppressed while the visitor is scrubbing the mobile strip so the
  // auto-centering doesn't fight their finger.
  useEffect(() => {
    if (Date.now() < scrubUntil.current) return;
    // Suppress the rails' scrub handlers for the scroll this triggers.
    scrubUntil.current = Date.now() + 240;
    document.querySelector(`[data-thumb-idx="${index}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [index]);

  // Mobile strip scrubbing: whichever thumbnail sits nearest the strip's
  // center becomes the main image, live, while the visitor scrolls it.
  const onStripScroll = () => {
    const el = stripRef.current;
    if (!el) return;
    scrubUntil.current = Date.now() + 240;
    if (scrubRaf.current) return;
    scrubRaf.current = requestAnimationFrame(() => {
      scrubRaf.current = 0;
      const el = stripRef.current;
      if (!el) return;
      const center = el.scrollLeft + el.clientWidth / 2;
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < el.children.length; i++) {
        const c = el.children[i] as HTMLElement;
        const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - center);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best !== index) onIndexChange(best);
    });
  };

  // Desktop vertical rail scrubbing (WEB-223): scrolling the thumbnail rail
  // drives the main image too — whichever thumb sits nearest the rail's
  // vertical center becomes active, live. The programmatic keep-in-view
  // scroll is suppressed via scrubUntil so the two never fight.
  const railRef = useRef<HTMLDivElement>(null);
  const railRaf = useRef(0);
  const onRailScroll = () => {
    const el = railRef.current;
    if (!el) return;
    scrubUntil.current = Date.now() + 240;
    if (railRaf.current) return;
    railRaf.current = requestAnimationFrame(() => {
      railRaf.current = 0;
      const el = railRef.current;
      if (!el) return;
      const center = el.scrollTop + el.clientHeight / 2;
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < el.children.length; i++) {
        const c = el.children[i] as HTMLElement;
        const d = Math.abs(c.offsetTop + c.offsetHeight / 2 - center);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best !== index) onIndexChange(best);
    });
  };

  // lock page scroll while the lightbox or the mobile options sheet is up
  useEffect(() => {
    if (!lightbox && !sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [lightbox, sheetOpen]);

  // culling keys — same muscle memory as the grid, plus ←/→ and Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof Element && t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (lightbox) {
          setLightbox(false);
          setZoom(1);
        } else if (sheetOpen) setSheetOpen(false);
        else onClose();
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        step(1);
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        step(-1);
        return;
      }
      if (!item) return;
      const k = e.key.toLowerCase();
      const advance = () => {
        if (index < items.length - 1) step(1);
      };
      if (k === "p") {
        e.preventDefault();
        onFlag(item.id, "approve");
        advance();
      } else if (k === "x") {
        e.preventDefault();
        onFlag(item.id, "reject");
        advance();
      } else if (k === "u") {
        e.preventDefault();
        onFlag(item.id, "reset");
        advance();
      } else if (k === "f") {
        e.preventDefault();
        onFavorite(item.id);
      } else if (/^[0-5]$/.test(k)) {
        e.preventDefault();
        onRate(item.id, { stars: Number(k) });
        advance();
      } else if (/^[6-9]$/.test(k)) {
        e.preventDefault();
        const c = Number(k) - 5;
        onRate(item.id, { color: item.color === c ? 0 : c });
        advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- closures read latest render values
  });

  if (!item) return null;

  const previewSrc = `/api/assets/${item.id}?variant=preview${derivVersion ? `&v=${derivVersion}` : ""}`;
  const shownDims = item.width && item.height ? `${item.width} × ${item.height}` : dims ? `${dims.w} × ${dims.h}` : null;

  const thumb = (i: number) => {
    const t = items[i];
    return (
      <button
        key={t.id}
        type="button"
        data-thumb-idx={i}
        onClick={() => onIndexChange(i)}
        aria-label={`Show ${t.filename}`}
        aria-current={i === index}
        className={`relative aspect-square w-16 shrink-0 overflow-hidden rounded-md border transition-colors lg:w-full ${
          i === index ? "border-primary ring-2 ring-primary/40" : "border-hairline hover:border-hairline-strong"
        }`}
      >
        {t.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element -- authorized proxy, no optimizer
          <img
            src={`/api/assets/${t.id}?variant=thumb${derivVersion ? `&v=${derivVersion}` : ""}`}
            alt=""
            loading="lazy"
            draggable={false}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <FileTypeIcon kind={t.kind} filename={t.filename} className="h-5 w-5" badge={false} />
          </span>
        )}
        {t.status === "rejected" && <span className="absolute inset-0 bg-canvas/50" aria-hidden />}
      </button>
    );
  };

  // Panel content, shared by the desktop sidebar and the mobile sheet.
  const panelInner = (
    <>
      {/* Status */}
      <section aria-label="Status">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">Status</h3>
        <div className="flex overflow-hidden rounded-md border border-hairline">
          {([["approve", "Approve", "approved"], ["reject", "Reject", "rejected"], ["reset", "Reset", "uploaded"]] as const).map(([action, label, st]) => (
            <button
              key={action}
              type="button"
              onClick={() => onFlag(item.id, action)}
              className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors ${
                item.status === st
                  ? st === "approved"
                    ? "bg-success/15 text-success-text"
                    : st === "rejected"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-surface-2 text-ink"
                  : "text-ink-muted hover:bg-surface-2"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* Stars */}
      <section aria-label="Rating">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">Rating</h3>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onRate(item.id, { stars: item.stars === n ? 0 : n })}
              aria-label={`Rate ${item.filename} ${n} stars`}
              className="rounded p-0.5 transition-transform hover:scale-110"
            >
              <Star
                className={`h-5 w-5 ${n <= item.stars ? "fill-amber-400 text-amber-400" : "text-ink-tertiary hover:text-ink"}`}
                aria-hidden
              />
            </button>
          ))}
          <button
            type="button"
            onClick={() => onFavorite(item.id)}
            aria-pressed={item.tags.includes("favorite")}
            title="Favorite (F)"
            className="ml-auto rounded p-1 transition-colors hover:bg-surface-2"
          >
            <Heart
              className={`h-4.5 w-4.5 ${item.tags.includes("favorite") ? "fill-amber-400 text-amber-400" : "text-ink-tertiary"}`}
              aria-hidden
            />
          </button>
        </div>
      </section>

      {/* Color label */}
      <section aria-label="Color label">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">Label</h3>
        <div className="flex items-center gap-2">
          {COLOR_HEX.map((hex, c) => (
            <button
              key={c}
              type="button"
              onClick={() => onRate(item.id, { color: item.color === c ? 0 : c })}
              aria-label={`${COLOR_NAMES[c]} label`}
              aria-pressed={item.color === c}
              title={COLOR_NAMES[c]}
              className={`h-5.5 w-5.5 rounded-full border transition-transform hover:scale-110 ${item.color === c ? "border-ink ring-2 ring-ink/30" : "border-hairline-strong"}`}
              style={{ background: c === 0 ? "transparent" : hex }}
            />
          ))}
        </div>
      </section>

      {/* Tags */}
      <section aria-label="Tags">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">Tags</h3>
        {item.tags.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {item.tags.map((t) => (
              <span key={t} className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-muted">
                {t}
                <button
                  type="button"
                  onClick={() => onTag(item.id, t, false)}
                  aria-label={`Remove tag ${t}`}
                  className="text-ink-tertiary hover:text-destructive"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            ))}
          </div>
        )}
        <input
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value.toLowerCase().replace(/[^a-z0-9 -]/g, "").slice(0, 30))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && tagDraft.trim()) {
              onTag(item.id, tagDraft.trim(), true);
              setTagDraft("");
            }
          }}
          placeholder="add tag + Enter"
          className="w-full rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-xs text-ink outline-none focus:border-primary"
        />
      </section>

      {/* Folder (WEB-216) */}
      {onMove && (
        <section aria-label="Folder">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">Folder</h3>
          <select
            value={item.folderId ?? ""}
            onChange={(e) => onMove(item.id, e.target.value || null)}
            aria-label="Move this file to a folder"
            className="snap-select w-full rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-xs text-ink outline-none focus:border-primary"
          >
            <option value="">Unfiled</option>
            {(folders ?? []).map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </section>
      )}

      {/* Metadata */}
      <section aria-label="Metadata">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">Details</h3>
        <dl className="flex flex-col gap-2 text-xs">
          <Meta label="File">{item.filename}</Meta>
          <Meta label="Type">{item.mimeType}</Meta>
          {shownDims && <Meta label="Dimensions">{shownDims}</Meta>}
          <Meta label="Size">{mb(item.bytes)}</Meta>
          <Meta label="Uploaded">{new Date(item.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</Meta>
          <Meta label="Metadata">{item.exifStripped ? "EXIF stripped at upload" : exif ? "Original EXIF kept" : "Not stripped"}</Meta>
          {(exif?.make || exif?.model) && <Meta label="Camera">{[exif.make, exif.model].filter(Boolean).join(" ")}</Meta>}
          {exif?.taken && <Meta label="Taken">{exif.taken}</Meta>}
          {item.rawArchivedAt && <Meta label="RAW">In cold storage — restorable from the RAW Vault</Meta>}
        </dl>
      </section>

      <a
        href={`/api/assets/${item.id}`}
        target="_blank"
        rel="noreferrer"
        className="mt-auto rounded-md border border-hairline px-3 py-1.5 text-center text-xs font-medium text-ink transition-colors hover:bg-surface-2"
      >
        Open original ↗
      </a>
    </>
  );

  return (
    <section aria-label={`Managing ${item.filename}`} className="flex flex-col gap-3 lg:h-[calc(100dvh-215px)] lg:min-h-[520px]">
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to grid"
          className="rounded-md border border-hairline bg-surface-1 p-1.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink" title={item.filename}>
          {item.filename}
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[item.status] ?? ""}`}>{item.status}</span>
        <span className="shrink-0 text-xs tabular-nums text-ink-tertiary">
          {index + 1} / {items.length}
        </span>
      </div>

      {/* Mobile: strip on top (scrolling it scrubs the main image) · main
       * image (swipe left/right to navigate) · bottom bar. Desktop row:
       * image | options panel | thumbnail rail. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        {/* Horizontal filmstrip — scrubbing it drives the main image (mobile). */}
        <div
          ref={stripRef}
          onScroll={onStripScroll}
          className="no-scrollbar relative flex gap-1.5 overflow-x-auto rounded-[12px] border border-hairline bg-surface-1 p-1.5 lg:hidden"
        >
          {items.map((_, i) => thumb(i))}
        </div>

        <div
          className="relative flex h-[52dvh] min-w-0 flex-1 items-center justify-center overflow-hidden rounded-[12px] border border-hairline bg-surface-1 p-2 lg:h-auto"
          style={{ touchAction: "pan-y" }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {item.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element -- authorized proxy, no optimizer
            <img
              src={previewSrc}
              alt={item.filename}
              draggable={false}
              onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              onClick={() => {
                if (tappedAfterSwipe()) return;
                setZoom(1);
                setLightbox(true);
              }}
              className="max-h-full max-w-full cursor-zoom-in select-none object-contain"
              style={{
                transform: swipeDx ? `translateX(${swipeDx}px)` : undefined,
                opacity: swipeDx ? Math.max(0.45, 1 - Math.abs(swipeDx) / 320) : undefined,
                transition: swipeDx ? "none" : "transform 180ms ease, opacity 180ms ease",
              }}
            />
          ) : item.kind === "video" ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption -- managed video
            <video src={`/api/assets/${item.id}`} controls playsInline preload="metadata" className="max-h-full max-w-full" />
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-[12px] border border-hairline bg-surface-1 px-10 py-8 text-ink-tertiary">
              <FileTypeIcon kind={item.kind} filename={item.filename} className="h-10 w-10" />
              <span className="max-w-xs truncate text-xs">{item.filename} — no inline preview</span>
            </div>
          )}
          {item.status === "rejected" && (
            <span className="pointer-events-none absolute inset-0 bg-canvas/40" aria-hidden title="Rejected" />
          )}
        </div>

        {/* Options panel — desktop sidebar; on mobile it lives in the bottom sheet. */}
        <aside className="no-scrollbar hidden w-72 shrink-0 lg:flex min-h-0 flex-col gap-5 overflow-y-auto rounded-[12px] border border-hairline bg-surface-1 p-4">
          {panelInner}
        </aside>

        {/* Vertical thumbnail rail — the code-editor "scrollbar" (desktop).
         * No visible scrollbar; wheel/drag still scrolls, click jumps. */}
        <div
          ref={railRef}
          onScroll={onRailScroll}
          className="no-scrollbar hidden w-[76px] shrink-0 flex-col gap-1 overflow-y-auto rounded-[12px] border border-hairline bg-surface-1 p-1.5 lg:flex"
        >
          {items.map((_, i) => thumb(i))}
        </div>
      </div>

      {/* Mobile bottom bar (Midjourney-style): quick actions + a summary line.
       * Tap anywhere (or swipe up) expands the full options/metadata sheet. */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={sheetOpen}
        aria-label="Show options and details"
        onClick={() => setSheetOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSheetOpen(true);
          }
        }}
        onTouchStart={(e) => {
          barTouchY.current = e.touches[0].clientY;
        }}
        onTouchEnd={(e) => {
          if (barTouchY.current - e.changedTouches[0].clientY > 48) setSheetOpen(true);
        }}
        className="sticky bottom-2 z-30 flex cursor-pointer flex-col gap-1.5 rounded-[14px] border border-hairline bg-canvas/90 px-3 py-2.5 shadow-lg backdrop-blur lg:hidden"
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-pressed={item.status === "approved"}
            aria-label="Approve"
            title="Approve"
            onClick={(e) => {
              e.stopPropagation();
              onFlag(item.id, "approve");
            }}
            className={`rounded-md p-1.5 transition-colors ${item.status === "approved" ? "bg-success/15 text-success-text" : "text-ink-muted hover:bg-surface-2"}`}
          >
            <Check className="h-4.5 w-4.5" aria-hidden />
          </button>
          <button
            type="button"
            aria-pressed={item.status === "rejected"}
            aria-label="Reject"
            title="Reject"
            onClick={(e) => {
              e.stopPropagation();
              onFlag(item.id, "reject");
            }}
            className={`rounded-md p-1.5 transition-colors ${item.status === "rejected" ? "bg-destructive/10 text-destructive" : "text-ink-muted hover:bg-surface-2"}`}
          >
            <X className="h-4.5 w-4.5" aria-hidden />
          </button>
          <span className="mx-1 h-4 w-px bg-hairline" aria-hidden />
          <button
            type="button"
            aria-label={`Stars: ${item.stars} — tap to raise`}
            title="Stars"
            onClick={(e) => {
              e.stopPropagation();
              onRate(item.id, { stars: (item.stars + 1) % 6 });
            }}
            className="flex items-center gap-0.5 rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-2"
          >
            <Star className={`h-4 w-4 ${item.stars ? "fill-amber-400 text-amber-400" : ""}`} aria-hidden />
            {item.stars > 0 && <span className="text-[11px] tabular-nums">{item.stars}</span>}
          </button>
          <button
            type="button"
            aria-pressed={item.tags.includes("favorite")}
            aria-label="Favorite"
            title="Favorite"
            onClick={(e) => {
              e.stopPropagation();
              onFavorite(item.id);
            }}
            className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-2"
          >
            <Heart className={`h-4 w-4 ${item.tags.includes("favorite") ? "fill-amber-400 text-amber-400" : ""}`} aria-hidden />
          </button>
          {item.color > 0 && (
            <span
              aria-label={`${COLOR_NAMES[item.color]} label`}
              className="ml-0.5 h-3.5 w-3.5 rounded-full border border-ink/20"
              style={{ background: COLOR_HEX[item.color] }}
            />
          )}
          <span className="ml-auto flex items-center gap-1 pr-0.5 text-[11px] font-medium text-ink-muted">
            Details
            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
          </span>
        </div>
        <p className="truncate text-[11px] text-ink-tertiary">
          {item.filename} · {shownDims ?? item.mimeType} · {mb(item.bytes)}
        </p>
      </div>

      {/* Mobile options sheet — the desktop panel's content as an expandable
       * bottom sheet; drag the handle down, tap the backdrop, or Escape. */}
      {sheetOpen && (
        <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label={`Options and details for ${item.filename}`}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setSheetOpen(false)} />
          <div
            className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-[16px] border-t border-hairline bg-surface-1 shadow-2xl"
            onTouchStart={(e) => {
              sheetTouchY.current = e.touches[0].clientY;
            }}
            onTouchEnd={(e) => {
              if (e.changedTouches[0].clientY - sheetTouchY.current > 56) setSheetOpen(false);
            }}
          >
            <div className="flex shrink-0 flex-col gap-2 px-4 pb-2 pt-2.5">
              <span className="mx-auto h-1 w-10 rounded-full bg-hairline-strong" aria-hidden />
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink" title={item.filename}>
                  {item.filename}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-ink-tertiary">
                  {index + 1} / {items.length}
                </span>
                <button
                  type="button"
                  aria-label="Close options"
                  onClick={() => setSheetOpen(false)}
                  className="rounded-md p-1 text-ink-tertiary transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
            <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-6">
              {panelInner}
            </div>
          </div>
        </div>
      )}

      {/* Zoom lightbox — blurred backdrop; click image toggles zoom, click
       * outside (or Escape) returns to this manage layout. */}
      {lightbox && item.kind === "image" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Zoomed ${item.filename}`}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-white/85 p-4 backdrop-blur-sm"
          onClick={() => {
            setLightbox(false);
            setZoom(1);
          }}
        >
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- zoom toggle; Escape/backdrop close */}
          <img
            src={previewSrc}
            alt={item.filename}
            draggable={false}
            onClick={(e) => {
              e.stopPropagation();
              if (zoom > 1) {
                setZoom(1);
              } else {
                const r = e.currentTarget.getBoundingClientRect();
                setZoomOrigin(
                  `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}% ${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`,
                );
                setZoom(2.5);
              }
            }}
            className="max-h-full max-w-full select-none object-contain shadow-2xl transition-transform duration-200"
            style={{ transform: `scale(${zoom})`, transformOrigin: zoomOrigin, cursor: zoom > 1 ? "zoom-out" : "zoom-in", background: "#fff" }}
          />
          <div className="pointer-events-none absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/50 px-4 py-1.5 text-xs text-white backdrop-blur">
            <span className="max-w-[240px] truncate">{item.filename}</span>
            <span className="opacity-70">
              {index + 1} / {items.length}
            </span>
          </div>
          <button
            type="button"
            aria-label="Close zoom view"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox(false);
              setZoom(1);
            }}
            className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white backdrop-blur transition-colors hover:bg-black/70"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </section>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-ink-tertiary">{label}</dt>
      <dd className="truncate text-right text-ink" title={typeof children === "string" ? children : undefined}>
        {children}
      </dd>
    </div>
  );
}
