"use client";

/* PhotoArranger - the one component every "put these photos in order" surface
 * uses (the Files-tab Share panel before sending, and the Arrange view on a
 * sent gallery). It is deliberately host-agnostic: the host supplies how a
 * move / a sort is PERSISTED (a gallery PUTs to the server immediately; the
 * pre-send panel just keeps the order in state), so the experience is
 * identical everywhere.
 *
 *  - Big, adjustable thumbnails (size slider, full-frame or square crop) and a
 *    full-size preview (double-click / eye button / Space).
 *  - REAL-TIME drag and drop: as you drag, the other photos make room live
 *    (they animate out of the way), exactly where the photos will land. A
 *    multi-selection drags as one group. The drag ghost is portalled to <body>,
 *    so it follows the cursor no matter what transformed container hosts us.
 *  - Sort menu (filename, date taken, upload date, color, random) then fine-tune.
 *  - Touch / keyboard: To start, Earlier, Later, To end, Move to... */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@webcules/ui/components/button";

import { MediaLightbox } from "@/components/media-lightbox";
import { SORT_LABELS, SORT_MODES, applyMove, dropTarget, type OrderMode, type SortMode } from "@/lib/gallery-order";
import type { ArrangeItem } from "@/lib/arrange-client";

const DRAG_THRESHOLD_PX = 6;
const TILE_MIN = 110;
const TILE_MAX = 380;
const TILE_DEFAULT = 190;
const TILE_KEY = "snap:arrange:tile";
const FIT_KEY = "snap:arrange:fit";

export type SortResult = { order: string[] } | null;

export type PhotoArrangerProps = {
  /** The photos in their CURRENT order. Pass a new array to reset the arranger. */
  items: ArrangeItem[];
  /** How the photos are currently ordered. */
  mode: OrderMode;
  /** Persist a move (host decides how). Resolve false to revert the move. */
  onMove: (ids: string[], beforeId: string | null) => Promise<boolean>;
  /** Apply a sort (host decides how) and resolve the new full order. */
  onSort: (mode: SortMode, setStatus: (message: string) => void) => Promise<SortResult>;
  /** Fires after every successful change with the full order + mode. */
  onOrderChange?: (order: string[], mode: OrderMode) => void;
  /** Override the thumbnail URL (the dev harness uses synthetic images). */
  thumbUrl?: (id: string, kind: string, px: number) => string;
  className?: string;
};

function defaultThumb(id: string, _kind: string, px: number): string {
  return `/api/assets/${id}?variant=${px > 240 ? "preview" : "thumb"}`;
}

function readPref<T extends string | number>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return (typeof fallback === "number" ? Number(raw) || fallback : raw) as T;
  } catch {
    return fallback;
  }
}

function writePref(key: string, value: string | number) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // preference only
  }
}

type Drag = { ids: string[]; x: number; y: number; before: string | null };

export function PhotoArranger({ items, mode: initialMode, onMove, onSort, onOrderChange, thumbUrl = defaultThumb, className = "" }: PhotoArrangerProps) {
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const [order, setOrder] = useState<string[]>(() => items.map((i) => i.id));
  const [mode, setMode] = useState<OrderMode>(initialMode);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [folder, setFolder] = useState<string | null>(null);
  const [tile, setTile] = useState(TILE_DEFAULT);
  const [fit, setFit] = useState<"contain" | "cover">("contain");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  // A sort that would overwrite a hand-made order asks first - inline, because
  // a modal confirm would render underneath this full-screen layer.
  const [confirmSort, setConfirmSort] = useState<SortMode | null>(null);

  const scroller = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const lastClicked = useRef<string | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const orderRef = useRef(order);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const prevOffsets = useRef(new Map<string, { x: number; y: number }>());
  orderRef.current = order;

  // Reset when the host hands us a different set of photos (hosts keep `items`
  // referentially stable while the arranger is open - the order lives here).
  const modeRef = useRef(initialMode);
  modeRef.current = initialMode;
  useEffect(() => {
    setOrder(items.map((i) => i.id));
    setMode(modeRef.current);
    setSelected(new Set());
    setFolder(null);
  }, [items]);

  useEffect(() => {
    setTile(Math.min(TILE_MAX, Math.max(TILE_MIN, readPref(TILE_KEY, TILE_DEFAULT))));
    setFit(readPref<string>(FIT_KEY, "contain") === "cover" ? "cover" : "contain");
  }, []);

  /** What the grid shows: during a drag, the order AS IF dropped right now. */
  const shown = useMemo(() => (drag ? applyMove(order, drag.ids, drag.before) : order), [order, drag]);
  const folders = useMemo(() => {
    const seen: string[] = [];
    for (const id of order) {
      const f = byId.get(id)?.folder;
      if (f && !seen.includes(f)) seen.push(f);
    }
    return seen;
  }, [order, byId]);
  const visible = useMemo(() => (folder ? shown.filter((id) => byId.get(id)?.folder === folder) : shown), [shown, folder, byId]);
  const positionOf = useMemo(() => new Map(order.map((id, i) => [id, i + 1])), [order]);
  const selectedInOrder = useMemo(() => order.filter((id) => selected.has(id)), [order, selected]);

  /* ---------- FLIP: photos glide out of the way while dragging ---------- */
  useLayoutEffect(() => {
    const root = grid.current;
    if (!root) return;
    const next = new Map<string, { x: number; y: number }>();
    const els = root.querySelectorAll<HTMLElement>("[data-aid]");
    els.forEach((el) => next.set(el.dataset.aid!, { x: el.offsetLeft, y: el.offsetTop }));
    if (dragRef.current) {
      els.forEach((el) => {
        const id = el.dataset.aid!;
        const before = prevOffsets.current.get(id);
        const now = next.get(id)!;
        if (!before || (Math.abs(before.x - now.x) < 1 && Math.abs(before.y - now.y) < 1)) return;
        el.style.transition = "none";
        el.style.transform = `translate(${before.x - now.x}px, ${before.y - now.y}px)`;
        requestAnimationFrame(() => {
          el.style.transition = "transform 170ms cubic-bezier(.2,.8,.2,1)";
          el.style.transform = "";
        });
      });
    }
    prevOffsets.current = next;
  }, [shown, tile, folder]);

  /* ---------- committing changes ---------- */

  const commitMove = useCallback(
    (ids: string[], beforeId: string | null) => {
      const current = orderRef.current;
      const next = applyMove(current, ids, beforeId);
      if (next.join() === current.join()) return;
      setOrder(next);
      setMode("custom");
      queue.current = queue.current.then(async () => {
        const ok = await onMove(ids, beforeId).catch(() => false);
        if (!ok) {
          setOrder(current);
          setStatus("Couldn't save that move - try again.");
          return;
        }
        setStatus("");
        onOrderChange?.(next, "custom");
      });
    },
    [onMove, onOrderChange],
  );

  function requestSort(next: SortMode) {
    if (mode === "custom" && order.length > 1) setConfirmSort(next);
    else void applySort(next);
  }

  async function applySort(next: SortMode) {
    setConfirmSort(null);
    setBusy(true);
    setStatus("");
    try {
      const result = await onSort(next, setStatus);
      if (!result) {
        setStatus("Couldn't sort - try again.");
      } else {
        setOrder(result.order);
        setMode(next);
        setStatus("");
        onOrderChange?.(result.order, next);
        scroller.current?.scrollTo({ top: 0 });
      }
    } catch {
      setStatus("Couldn't sort - try again.");
    }
    setBusy(false);
  }

  /* ---------- selection ---------- */

  function toggle(id: string, shift: boolean, meta: boolean) {
    setSelected((cur) => {
      const next = new Set(meta || shift ? cur : []);
      if (shift && lastClicked.current && visible.includes(lastClicked.current)) {
        const [a, b] = [visible.indexOf(lastClicked.current), visible.indexOf(id)].sort((x, y) => x - y);
        for (const v of visible.slice(a, b + 1)) next.add(v);
      } else if (cur.has(id) && (meta || cur.size === 1)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    lastClicked.current = id;
  }

  function onTileClick(id: string, e: React.MouseEvent) {
    if (placing) {
      const ids = selectedInOrder.filter((s) => s !== id);
      setPlacing(false);
      commitMove(ids, id);
      return;
    }
    toggle(id, e.shiftKey, e.metaKey || e.ctrlKey);
  }

  /* ---------- toolbar moves ---------- */

  const firstAfter = (id: string, moving: Set<string>): string | null => order.slice(order.indexOf(id) + 1).find((x) => !moving.has(x)) ?? null;
  const pool = folder ? visible : order;
  const moveStart = () => commitMove(selectedInOrder, pool.find((id) => !selected.has(id)) ?? null);
  const moveEnd = () => {
    const last = [...pool].reverse().find((id) => !selected.has(id));
    commitMove(selectedInOrder, last ? firstAfter(last, selected) : null);
  };
  const moveEarlier = () => {
    const target = order.slice(0, order.indexOf(selectedInOrder[0])).reverse().find((id) => !selected.has(id));
    if (target) commitMove(selectedInOrder, target);
  };
  const moveLater = () => {
    const target = order.slice(order.indexOf(selectedInOrder[selectedInOrder.length - 1]) + 1).find((id) => !selected.has(id));
    if (target) commitMove(selectedInOrder, firstAfter(target, selected));
  };

  /* ---------- real-time pointer drag ---------- */

  function onTilePointerDown(id: string, e: React.PointerEvent) {
    if (e.pointerType === "touch" || e.button !== 0 || placing || busy) return;
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const ids = selected.has(id) ? selectedInOrder : [id];
    let active = false;
    let raf = 0;
    let lastY = startY;

    const autoscroll = () => {
      const box = scroller.current?.getBoundingClientRect();
      if (box && dragRef.current) {
        const edge = 80;
        if (lastY < box.top + edge) scroller.current!.scrollBy({ top: -Math.ceil(((box.top + edge - lastY) / edge) * 22) });
        else if (lastY > box.bottom - edge) scroller.current!.scrollBy({ top: Math.ceil(((lastY - (box.bottom - edge)) / edge) * 22) });
        raf = requestAnimationFrame(autoscroll);
      }
    };

    const update = (x: number, y: number) => {
      const current = dragRef.current ?? { ids, x, y, before: null };
      let before = current.before;
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-aid]");
      const shownOrder = applyMove(orderRef.current, ids, before);
      if (el) {
        const rect = el.getBoundingClientRect();
        const target = dropTarget(shownOrder, ids, el.dataset.aid!, x > rect.left + rect.width / 2);
        if (target !== undefined) before = target;
      } else if (grid.current) {
        // Pointer over empty space: below the last row → end, above the first → start.
        const tiles = grid.current.querySelectorAll<HTMLElement>("[data-aid]");
        const first = tiles[0]?.getBoundingClientRect();
        const last = tiles[tiles.length - 1]?.getBoundingClientRect();
        if (last && y > last.bottom) before = null;
        else if (first && y < first.top) before = orderRef.current.find((i) => !ids.includes(i)) ?? null;
      }
      const next: Drag = { ids, x, y, before };
      dragRef.current = next;
      setDrag(next);
    };

    const move = (ev: PointerEvent) => {
      if (!active && Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD_PX) return;
      if (!active) {
        active = true;
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
        dragRef.current = { ids, x: ev.clientX, y: ev.clientY, before: null };
        raf = requestAnimationFrame(autoscroll);
      }
      lastY = ev.clientY;
      update(ev.clientX, ev.clientY);
    };

    const end = (commit: boolean) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
      cancelAnimationFrame(raf);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      const finished = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!active) return;
      // Swallow the click that follows a drag so it doesn't toggle selection.
      const swallow = (c: Event) => c.stopPropagation();
      window.addEventListener("click", swallow, true);
      setTimeout(() => window.removeEventListener("click", swallow, true), 0);
      if (commit && finished) commitMove(finished.ids, finished.before);
    };
    const up = () => end(true);
    const cancel = () => end(false);
    const key = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") end(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
  }

  const previewItems = useMemo(() => visible.map((id) => byId.get(id)).filter((x): x is ArrangeItem => Boolean(x)).map((i) => ({ id: i.id, filename: i.filename, kind: i.kind })), [visible, byId]);
  const ghostIds = drag ? drag.ids.slice(0, 3) : [];
  const ghostSize = Math.round(Math.min(150, Math.max(84, tile * 0.7)));

  return (
    <div className={`flex min-h-0 flex-col gap-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-xs text-ink-subtle">
          Sort by
          <select
            aria-label="Sort photos"
            disabled={busy}
            value=""
            onChange={(e) => {
              const v = e.target.value as SortMode;
              e.target.value = "";
              if (v) requestSort(v);
            }}
            className="snap-select rounded-md border border-hairline bg-canvas px-2 py-1.5 text-xs text-ink-muted"
          >
            <option value="">Choose a sort...</option>
            {SORT_MODES.map((m) => (
              <option key={m} value={m}>{SORT_LABELS[m]}</option>
            ))}
          </select>
        </label>
        <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] text-ink-muted" data-testid="order-mode">
          {mode === "custom" ? "Custom order" : `Sorted: ${SORT_LABELS[mode]}`}
        </span>
        <label className="flex items-center gap-2 text-xs text-ink-subtle">
          Size
          <input
            type="range"
            aria-label="Thumbnail size"
            min={TILE_MIN}
            max={TILE_MAX}
            step={10}
            value={tile}
            onChange={(e) => {
              const v = Number(e.target.value);
              setTile(v);
              writePref(TILE_KEY, v);
            }}
            className="w-28 accent-[var(--accent)]"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            const next = fit === "contain" ? "cover" : "contain";
            setFit(next);
            writePref(FIT_KEY, next);
          }}
          className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] text-ink-muted hover:text-ink"
          title="Show the whole photo, or crop to fill the tile"
        >
          {fit === "contain" ? "Full frame" : "Cropped"}
        </button>
        {folders.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {[null, ...folders].map((f) => (
              <button
                key={f ?? "all"}
                type="button"
                onClick={() => setFolder(f)}
                className={`rounded-full px-2.5 py-1 text-[11px] ${folder === f ? "bg-ink text-canvas" : "bg-surface-2 text-ink-muted hover:text-ink"}`}
              >
                {f ?? "All"}
              </button>
            ))}
          </div>
        )}
        <span className="ml-auto text-xs text-ink-tertiary" aria-live="polite">{status}</span>
      </div>

      {confirmSort && (
        <div role="alertdialog" className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-xs text-ink">
          <span>Sorting by &ldquo;{SORT_LABELS[confirmSort]}&rdquo; replaces the order you set by hand.</span>
          <Button size="sm" onClick={() => void applySort(confirmSort)}>Sort photos</Button>
          <Button size="sm" variant="outline" onClick={() => setConfirmSort(null)}>Keep my order</Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-ink-subtle">{selected.size} selected</span>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setSelected(new Set(visible))}>Select all</Button>
        <Button size="sm" variant="outline" disabled={!selected.size} onClick={() => { setSelected(new Set()); setPlacing(false); }}>Clear</Button>
        <span className="mx-1 h-4 w-px bg-hairline" />
        <Button size="sm" variant="outline" disabled={!selected.size || busy} onClick={moveStart}>To start</Button>
        <Button size="sm" variant="outline" disabled={!selected.size || busy} onClick={moveEarlier}>Earlier</Button>
        <Button size="sm" variant="outline" disabled={!selected.size || busy} onClick={moveLater}>Later</Button>
        <Button size="sm" variant="outline" disabled={!selected.size || busy} onClick={moveEnd}>To end</Button>
        <Button size="sm" variant={placing ? "default" : "outline"} disabled={!selected.size || busy} onClick={() => setPlacing((p) => !p)}>
          {placing ? "Tap where they go..." : "Move to..."}
        </Button>
        <span className="ml-auto hidden text-ink-tertiary md:inline">Drag to reorder · shift-click selects a range · double-click to view</span>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-hairline bg-surface-1 p-3" style={{ minHeight: 220 }}>
        <div
          ref={grid}
          role="listbox"
          aria-label="Photos in gallery order"
          aria-multiselectable
          className="relative grid gap-2.5"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${tile}px, 1fr))` }}
        >
          {visible.map((id) => {
            const a = byId.get(id);
            if (!a) return null;
            const isSel = selected.has(id);
            const isGhost = drag?.ids.includes(id) ?? false;
            const index = visible.indexOf(id);
            return (
              <div
                key={id}
                data-aid={id}
                role="option"
                aria-selected={isSel}
                tabIndex={0}
                aria-label={`${a.filename}, position ${positionOf.get(id)}`}
                onClick={(e) => onTileClick(id, e)}
                onDoubleClick={() => setPreview(index)}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    if (e.key === " ") setPreview(index);
                    else toggle(id, e.shiftKey, e.metaKey || e.ctrlKey);
                  }
                }}
                onPointerDown={(e) => onTilePointerDown(id, e)}
                className={`group relative select-none overflow-hidden rounded-lg border bg-canvas outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${isSel ? "border-[var(--accent)] ring-2 ring-[var(--accent)]" : "border-hairline"} ${isGhost ? "border-dashed opacity-40" : ""} ${placing ? "cursor-crosshair" : "cursor-grab"}`}
                style={{ contentVisibility: "auto", containIntrinsicSize: `${tile}px ${Math.round(tile * 0.75)}px` }}
              >
                <div className="relative bg-surface-2" style={{ aspectRatio: fit === "contain" ? "4 / 3" : "1 / 1" }}>
                  {a.kind === "image" || a.kind === "video" ? (
                    // eslint-disable-next-line @next/next/no-img-element -- authorized proxy, no optimizer
                    <img
                      src={thumbUrl(id, a.kind, tile)}
                      alt=""
                      loading="lazy"
                      draggable={false}
                      className={`absolute inset-0 h-full w-full ${fit === "contain" ? "object-contain" : "object-cover"}`}
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] uppercase text-ink-tertiary">{a.kind}</span>
                  )}
                </div>
                <span className="absolute left-1.5 top-1.5 rounded bg-black/65 px-1.5 text-[11px] font-medium leading-5 text-white">{positionOf.get(id)}</span>
                {isSel && <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-[11px] text-white">✓</span>}
                <button
                  type="button"
                  data-no-drag
                  aria-label={`View ${a.filename} full size`}
                  title="View full size"
                  onClick={(e) => { e.stopPropagation(); setPreview(index); }}
                  className="absolute bottom-7 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></svg>
                </button>
                <span className="block truncate border-t border-hairline px-2 py-1 text-[11px] text-ink-subtle">{a.filename}</span>
              </div>
            );
          })}
        </div>
        {visible.length === 0 && <p className="py-10 text-center text-sm text-ink-subtle">No photos here yet.</p>}
      </div>

      {drag &&
        createPortal(
          <div className="pointer-events-none fixed z-[200]" style={{ left: drag.x, top: drag.y, transform: "translate(-50%, -50%)" }}>
            <div className="relative" style={{ width: ghostSize, height: ghostSize }}>
              {ghostIds.map((id, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- authorized proxy, no optimizer
                <img
                  key={id}
                  src={thumbUrl(id, byId.get(id)?.kind ?? "image", 240)}
                  alt=""
                  className="absolute rounded-lg border-2 border-white bg-canvas object-cover shadow-2xl"
                  style={{ width: ghostSize, height: ghostSize, left: i * 7, top: i * 7, transform: `rotate(${(i - 1) * 4}deg)`, zIndex: 10 - i }}
                />
              ))}
              {drag.ids.length > 1 && (
                <span className="absolute -right-3 -top-3 z-20 flex h-7 min-w-7 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-xs font-semibold text-white shadow-lg">{drag.ids.length}</span>
              )}
            </div>
          </div>,
          document.body,
        )}

      {preview !== null && <MediaLightbox items={previewItems} index={preview} onIndexChange={setPreview} onClose={() => setPreview(null)} />}
    </div>
  );
}
