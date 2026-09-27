"use client";

/* Asset detail viewer (WEB-119) — modal inspection + fullscreen review.
 * Modal: large preview (derivative when present, original otherwise) with a
 * metadata sidebar; fullscreen: edge-to-edge flip-through with ←/→ keys,
 * zoom/pan on images, scrubbing video via the Range-aware proxy.
 *
 * Deliberately NOT a Radix dialog: fullscreen is a state of the same
 * overlay, and Radix aria-hides sibling layers — a separate fullscreen
 * layer next to an open Dialog loses names and focus. One overlay owns its
 * own ESC/Tab handling instead. */
import { useCallback, useEffect, useRef, useState } from "react";

import { ChevronLeft, ChevronRight, Maximize2, Minimize2, X, ZoomIn, ZoomOut } from "lucide-react";

export type ViewerItem = {
  id: string;
  filename: string;
  kind: string;
  status: string;
  bytes: number;
  mimeType: string;
  width: number | null;
  height: number | null;
  exifStripped: boolean;
  stars: number;
  color: number;
  tags: string[];
  createdAt: string;
};

type Exif = { make?: string; model?: string; taken?: string } | null;

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
        : ((buf[p] << 24) | (buf[p + 1] << 16) | (buf[p + 2] << 8) | buf[p + 3]) >>> 0;
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

export function AssetViewer({
  items,
  index,
  onIndexChange,
  onClose,
  derivVersion,
  onFlag,
  onRate,
  onFavorite,
}: {
  items: ViewerItem[];
  index: number | null;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  derivVersion?: number;
  /** Culling hooks (WEB-209 P0): flag/rate/favorite keys fire these and advance. */
  onFlag?: (id: string, action: "approve" | "reject" | "reset") => void;
  onRate?: (id: string, patch: { stars?: number; color?: number }) => void;
  onFavorite?: (id: string) => void;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [exif, setExif] = useState<Exif>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const open = index !== null && index >= 0 && index < items.length;
  const item = open ? items[index!] : null;
  const itemIndex = item ? items.indexOf(item) : -1;

  const step = useCallback(
    (dir: 1 | -1) => {
      if (index === null || !items.length) return;
      onIndexChange((index + dir + items.length) % items.length);
    },
    [index, items.length, onIndexChange],
  );

  // reset per-asset state + preload neighbors for snappy flipping
  useEffect(() => {
    setDims(null);
    setExif(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    if (!item) return;
    for (const d of [1, -1]) {
      const n = items[(itemIndex + d + items.length) % items.length];
      if (n && n !== item && n.kind === "image") {
        const img = new Image();
        img.src = `/api/assets/${n.id}?variant=preview${derivVersion ? `&v=${derivVersion}` : ""}`;
      }
    }
    if (!item.exifStripped && item.mimeType === "image/jpeg") {
      void readExif(`/api/assets/${item.id}`).then(setExif);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  // overlay lifecycle: focus in, scroll lock, restore focus on close
  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    overlayRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [open]);

  const zoomBy = (f: number) => setZoom((z) => Math.min(8, Math.max(1, z * f)));
  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      step(-1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (zoom > 1) resetZoom();
      else if (fullscreen) setFullscreen(false);
      else onClose();
    } else if (item && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // culling keys: flag/rate/favorite then advance (LRC muscle memory)
      const k = e.key.toLowerCase();
      const advance = () => { if (index !== null && index < items.length - 1) step(1); };
      if (k === "p") { e.preventDefault(); onFlag?.(item.id, "approve"); advance(); }
      else if (k === "x") { e.preventDefault(); onFlag?.(item.id, "reject"); advance(); }
      else if (k === "u") { e.preventDefault(); onFlag?.(item.id, "reset"); advance(); }
      else if (k === "f") { e.preventDefault(); onFavorite?.(item.id); }
      else if (/^[0-5]$/.test(k)) { e.preventDefault(); onRate?.(item.id, { stars: Number(k) }); advance(); }
      else if (/^[6-9]$/.test(k)) {
        e.preventDefault();
        const c = Number(k) - 5;
        onRate?.(item.id, { color: item.color === c ? 0 : c });
        advance();
      }
    } else if (e.key === "Tab") {
      // simple focus trap within the overlay
      const focusables = overlayRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], video, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!item || item.kind !== "image") return;
    e.preventDefault();
    setZoom((z) => Math.min(8, Math.max(1, z * (e.deltaY < 0 ? 1.15 : 0.87))));
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom === 1) return;
    dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setPan({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) });
  };

  if (!open || !item) return null;

  const previewSrc = `/api/assets/${item.id}?variant=preview${derivVersion ? `&v=${derivVersion}` : ""}`;
  const shownDims = item.width && item.height ? `${item.width} × ${item.height}` : dims ? `${dims.w} × ${dims.h}` : null;

  const mediaEl = (large: boolean) => {
    if (item.kind === "image") {
      return (
        // eslint-disable-next-line @next/next/no-img-element -- authorized proxy, no optimizer
        <img
          src={previewSrc}
          alt={item.filename}
          draggable={false}
          onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (dragRef.current = null)}
          onDoubleClick={() => (zoom === 1 ? zoomBy(2) : resetZoom())}
          className={large ? "max-h-full max-w-full select-none object-contain" : "max-h-full max-w-full select-none object-contain"}
          style={large ? { transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, cursor: zoom > 1 ? "grab" : "default" } : undefined}
        />
      );
    }
    if (item.kind === "video") {
      return (
        <video
          src={`/api/assets/${item.id}`}
          controls
          playsInline
          preload="metadata"
          className="max-h-full max-w-full"
        />
      );
    }
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-white/70">
        <span className="text-xs uppercase tracking-wide">{item.kind}</span>
        <span className="text-xs">.{item.filename.split(".").pop()} — no inline preview</span>
        <a href={`/api/assets/${item.id}`} target="_blank" rel="noreferrer" className="text-xs text-primary underline underline-offset-2">
          Open original ↗
        </a>
      </div>
    );
  };

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Reviewing ${item.filename}`}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className={`fixed inset-0 z-[80] flex items-center justify-center outline-none ${
        fullscreen ? "bg-black p-0" : "bg-black/60 p-4 sm:p-8"
      }`}
    >
      {fullscreen ? (
        <>
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden p-4" onWheel={onWheel}>
            {mediaEl(true)}
          </div>
          <button type="button" onClick={() => step(-1)} aria-label="Previous file" className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white backdrop-blur hover:bg-white/20">
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button type="button" onClick={() => step(1)} aria-label="Next file" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white backdrop-blur hover:bg-white/20">
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
          <div className="pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-3 rounded-full bg-white/10 px-4 py-1.5 text-xs text-white backdrop-blur">
            <span className="max-w-[220px] truncate">{item.filename}</span>
            <span className="opacity-70">
              {index! + 1} / {items.length}
            </span>
          </div>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-white backdrop-blur">
            <button type="button" onClick={() => zoomBy(1 / 1.3)} aria-label="Zoom out" disabled={zoom <= 1} className="rounded p-1.5 hover:bg-white/20 disabled:opacity-40">
              <ZoomOut className="h-4 w-4" aria-hidden />
            </button>
            <span className="w-10 text-center text-xs">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => zoomBy(1.3)} aria-label="Zoom in" className="rounded p-1.5 hover:bg-white/20">
              <ZoomIn className="h-4 w-4" aria-hidden />
            </button>
            {zoom > 1 && (
              <button type="button" onClick={resetZoom} className="rounded px-2 py-1 text-xs hover:bg-white/20">
                Reset
              </button>
            )}
            <span className="mx-1 h-4 w-px bg-white/20" aria-hidden />
            <button type="button" onClick={() => setFullscreen(false)} className="flex items-center gap-1.5 rounded px-2 py-1.5 text-xs hover:bg-white/20">
              <Minimize2 className="h-3.5 w-3.5" aria-hidden /> Exit fullscreen
            </button>
            <button type="button" onClick={onClose} aria-label="Close viewer" className="rounded p-1.5 hover:bg-white/20">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </>
      ) : (
        <div className="relative flex h-[82vh] max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-hairline bg-surface-1 shadow-2xl md:flex-row">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close viewer"
            className="absolute right-2 top-2 z-10 rounded-full bg-black/40 p-1.5 text-white backdrop-blur hover:bg-black/60"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
          <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black p-2 md:min-w-0">
            {mediaEl(false)}
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous file"
              className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white backdrop-blur hover:bg-white/25"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next file"
              className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white backdrop-blur hover:bg-white/25"
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto border-t border-hairline p-4 md:w-64 md:border-l md:border-t-0">
            <h2 className="truncate pr-6 text-sm font-medium text-ink" title={item.filename}>
              {item.filename}
            </h2>
            <dl className="flex flex-col gap-2.5 text-xs">
              <Meta label="Type">{item.mimeType}</Meta>
              {shownDims && <Meta label="Dimensions">{shownDims}</Meta>}
              <Meta label="Size">{mb(item.bytes)}</Meta>
              <Meta label="Status">{item.status}</Meta>
              {item.stars > 0 && <Meta label="Stars">{"★".repeat(item.stars)}</Meta>}
              {item.color > 0 && <Meta label="Color">{["", "Red", "Yellow", "Green", "Blue", "Purple"][item.color]}</Meta>}
              <Meta label="Uploaded">{item.createdAt.slice(0, 10)}</Meta>
              {item.tags.length > 0 && <Meta label="Tags">{item.tags.join(", ")}</Meta>}
              <Meta label="Metadata">{item.exifStripped ? "EXIF stripped at upload" : exif ? "Original EXIF kept" : "Not stripped"}</Meta>
              {exif && (exif.make || exif.model) && <Meta label="Camera">{[exif.make, exif.model].filter(Boolean).join(" ")}</Meta>}
              {exif?.taken && <Meta label="Taken">{exif.taken}</Meta>}
            </dl>
            <div className="mt-auto flex flex-col gap-2">
              <a
                href={`/api/assets/${item.id}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-ink-subtle underline underline-offset-2 hover:text-ink"
              >
                Open original ↗
              </a>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setFullscreen(true)}
                  className="flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-surface-2"
                >
                  <Maximize2 className="h-3.5 w-3.5" aria-hidden /> Fullscreen
                </button>
                <span className="text-xs text-ink-tertiary">
                  {index! + 1} / {items.length}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
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
