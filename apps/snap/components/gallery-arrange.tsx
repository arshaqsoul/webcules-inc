"use client";

/* Arrange photos (all plans) - reorder what a client sees in a delivered
 * gallery, live, without re-sending. Sort menu (filename, date taken, upload
 * date, color, random) applies inside each folder; drag and drop (mouse) or
 * "Move to..." (touch/keyboard) fine-tunes. The order is stored on the
 * gallery (share_grant_asset.position) - see lib/gallery-order.ts. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@webcules/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@webcules/ui/components/dialog";

import { useConfirm } from "@/components/confirm-provider";
import { colorKeyFromRgba } from "@/lib/color-sort";
import { POSITION_STEP, SORT_LABELS, SORT_MODES, planMove, type OrderMode, type SortMode } from "@/lib/gallery-order";

type ArrangeAsset = { id: string; filename: string; kind: string; folder: string | null; colorKey: number | null; capturedAt: number | null };
type Loaded = { assets: ArrangeAsset[]; orderMode: OrderMode; projectId: string };

const DRAG_THRESHOLD_PX = 6;

/** Moving `ids` before `beforeId` in a flat order (mirrors the server's planMove). */
function applyMove(order: string[], ids: string[], beforeId: string | null): string[] {
  return planMove(
    order.map((id, i) => ({ id, position: (i + 1) * POSITION_STEP })),
    ids,
    beforeId,
  ).order;
}

/** Browser-side rainbow analysis: thumbnail → 24x24 → colorKeyFromRgba. */
export async function analyzeColors(
  ids: string[],
  onProgress: (done: number) => void,
  save: (items: { id: string; key: number }[]) => Promise<void>,
): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = 24;
  canvas.height = 24;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  let done = 0;
  let batch: { id: string; key: number }[] = [];
  const flush = async () => {
    if (!batch.length) return;
    const out = batch;
    batch = [];
    await save(out);
  };
  for (const id of ids) {
    try {
      const img = new Image();
      img.src = `/api/assets/${id}?variant=thumb`;
      await img.decode();
      ctx.clearRect(0, 0, 24, 24);
      ctx.drawImage(img, 0, 0, 24, 24);
      batch.push({ id, key: colorKeyFromRgba(ctx.getImageData(0, 0, 24, 24).data) });
    } catch {
      // no decodable thumbnail (RAW/HEIC) - stays unanalysed and sorts last
    }
    done += 1;
    onProgress(done);
    if (batch.length >= 100) await flush();
  }
  await flush();
}

export function GalleryArrange({
  grantId,
  open,
  onOpenChange,
  onChanged,
}: {
  grantId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new order after every change (so the caller's grid stays in step). */
  onChanged?: (grantId: string, order: string[]) => void;
}) {
  const confirm = useConfirm();
  const [data, setData] = useState<Loaded | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [mode, setMode] = useState<OrderMode>("upload_old");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [folder, setFolder] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [drag, setDrag] = useState<{ ids: string[]; x: number; y: number; before: string | null; pos: "before" | "after"; over: string | null } | null>(null);
  const lastClicked = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map((data?.assets ?? []).map((a) => [a.id, a])), [data]);
  const folders = useMemo(() => {
    const seen: string[] = [];
    for (const id of order) {
      const f = byId.get(id)?.folder;
      if (f && !seen.includes(f)) seen.push(f);
    }
    return seen;
  }, [order, byId]);
  const visible = useMemo(() => (folder ? order.filter((id) => byId.get(id)?.folder === folder) : order), [order, folder, byId]);

  const load = useCallback(async () => {
    if (!grantId) return;
    setData(null);
    setStatus("");
    try {
      const res = await fetch(`/api/grants/${grantId}/assets`);
      if (!res.ok) throw new Error("load");
      const body = (await res.json()) as Loaded;
      setData(body);
      setOrder(body.assets.map((a) => a.id));
      setMode(body.orderMode);
      setSelected(new Set());
      setFolder(null);
    } catch {
      setStatus("Couldn't load this gallery - close and try again.");
    }
  }, [grantId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const put = useCallback(
    async (payload: Record<string, unknown>): Promise<{ order: string[]; orderMode: OrderMode } | null> => {
      if (!grantId) return null;
      try {
        const res = await fetch(`/api/grants/${grantId}/order`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) return null;
        return (await res.json()) as { order: string[]; orderMode: OrderMode };
      } catch {
        return null;
      }
    },
    [grantId],
  );

  /** Move ids before `beforeId` (optimistic; server confirms). */
  const moveTo = useCallback(
    async (ids: string[], beforeId: string | null) => {
      if (!ids.length) return;
      const next = applyMove(order, ids, beforeId);
      if (next.join() === order.join()) return;
      const previous = order;
      setOrder(next);
      setMode("custom");
      const result = await put({ op: "move", ids, beforeId });
      if (!result) {
        setOrder(previous);
        setStatus("Couldn't save that move - try again.");
        return;
      }
      setStatus("");
      if (grantId) onChanged?.(grantId, result.order);
    },
    [order, put, grantId, onChanged],
  );

  async function applySort(next: SortMode) {
    if (!grantId || !data) return;
    if (mode === "custom" && !(await confirm({ title: "Replace your custom order?", body: `Sorting by "${SORT_LABELS[next]}" rearranges the photos and replaces the order you set by hand.`, confirmLabel: "Sort photos" }))) return;
    setBusy(true);
    setStatus("");
    try {
      if (next === "taken_old" || next === "taken_new") {
        setStatus("Reading when each photo was taken...");
        for (let pass = 0; pass < 200; pass++) {
          const res = await fetch(`/api/projects/${data.projectId}/assets/order-meta`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scan: true }),
          });
          const body = (await res.json().catch(() => ({}))) as { remaining?: number };
          if (!res.ok || !body.remaining) break;
          setStatus(`Reading when each photo was taken... ${body.remaining} to go`);
        }
      }
      if (next === "color") {
        const metaRes = await fetch(`/api/projects/${data.projectId}/assets/order-meta`);
        const meta = (await metaRes.json().catch(() => ({}))) as { missingColor?: string[] };
        const inGallery = new Set(order);
        const missing = (meta.missingColor ?? []).filter((id) => inGallery.has(id));
        if (missing.length) {
          await analyzeColors(
            missing,
            (done) => setStatus(`Analyzing colors... ${done} of ${missing.length}`),
            async (items) => {
              await fetch(`/api/projects/${data.projectId}/assets/order-meta`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ colors: items }),
              });
            },
          );
        }
      }
      const result = await put({ op: "sort", mode: next, seed: Math.floor(Math.random() * 2 ** 31) });
      if (!result) {
        setStatus("Couldn't sort - try again.");
      } else {
        setOrder(result.order);
        setMode(next);
        setStatus("");
        if (grantId) onChanged?.(grantId, result.order);
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
      // "Move to..." - drop the selection in front of the clicked photo.
      const ids = [...selected].filter((s) => s !== id);
      setPlacing(false);
      void moveTo(ids, id);
      return;
    }
    toggle(id, e.shiftKey, e.metaKey || e.ctrlKey);
  }

  /* ---------- toolbar moves ---------- */

  const selectedInOrder = order.filter((id) => selected.has(id));
  /** The first photo after `id` (in gallery order) that is not being moved. */
  const firstAfter = (id: string, moving: Set<string>): string | null => order.slice(order.indexOf(id) + 1).find((x) => !moving.has(x)) ?? null;
  const moveStart = () => void moveTo(selectedInOrder, (folder ? visible : order).find((id) => !selected.has(id)) ?? null);
  const moveEnd = () => {
    const last = [...(folder ? visible : order)].reverse().find((id) => !selected.has(id));
    void moveTo(selectedInOrder, last ? firstAfter(last, selected) : null);
  };
  const moveEarlier = () => {
    const first = order.indexOf(selectedInOrder[0]);
    const target = order.slice(0, first).reverse().find((id) => !selected.has(id));
    if (target) void moveTo(selectedInOrder, target);
  };
  const moveLater = () => {
    const last = order.indexOf(selectedInOrder[selectedInOrder.length - 1]);
    const target = order.slice(last + 1).find((id) => !selected.has(id));
    if (target) void moveTo(selectedInOrder, firstAfter(target, selected));
  };

  /* ---------- pointer drag and drop (mouse / pen) ---------- */

  function targetAt(x: number, y: number, moving: string[]): { over: string | null; pos: "before" | "after"; before: string | null } {
    const el = document.elementFromPoint(x, y)?.closest("[data-aid]") as HTMLElement | null;
    if (!el) return { over: null, pos: "after", before: null };
    const rect = el.getBoundingClientRect();
    const pos: "before" | "after" = x < rect.left + rect.width / 2 ? "before" : "after";
    const id = el.dataset.aid!;
    // "after the last tile of the view" = before whatever follows it overall.
    const before = pos === "before" ? id : firstAfter(id, new Set(moving));
    return { over: id, pos, before };
  }

  function onTilePointerDown(id: string, e: React.PointerEvent) {
    if (e.pointerType === "touch" || e.button !== 0 || placing || busy) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const ids = selected.has(id) ? selectedInOrder : [id];
    let dragging = false;
    let current = { ids, x: startX, y: startY, before: null as string | null, pos: "after" as "before" | "after", over: null as string | null };

    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD_PX) return;
      dragging = true;
      current = { ...current, x: ev.clientX, y: ev.clientY, ...targetAt(ev.clientX, ev.clientY, ids) };
      setDrag(current);
      // Edge auto-scroll while dragging.
      const box = scroller.current?.getBoundingClientRect();
      if (box) {
        if (ev.clientY < box.top + 56) scroller.current!.scrollBy({ top: -18 });
        else if (ev.clientY > box.bottom - 56) scroller.current!.scrollBy({ top: 18 });
      }
    };
    const finish = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      setDrag(null);
      if (!dragging || ev.type === "pointercancel") return;
      const t = targetAt(ev.clientX, ev.clientY, ids);
      if (t.over) void moveTo(ids, t.before);
      // Swallow the click that follows a drag so it doesn't toggle selection -
      // and drop the guard right after, so a drag that ends with no click
      // can't eat the user's next real one.
      const swallow = (c: Event) => c.stopPropagation();
      window.addEventListener("click", swallow, true);
      setTimeout(() => window.removeEventListener("click", swallow, true), 0);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  const modeLabel = SORT_LABELS[mode];
  const dragging = drag !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Arrange photos</DialogTitle>
          <DialogDescription>
            Sort, or drag photos into the order your client sees them. Changes are live - no need to re-send.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-ink-subtle">
            Sort by
            <select
              aria-label="Sort photos"
              disabled={busy || !data}
              value=""
              onChange={(e) => {
                const v = e.target.value as SortMode;
                e.target.value = "";
                if (v) void applySort(v);
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
            {mode === "custom" ? "Custom order" : `Sorted: ${modeLabel}`}
          </span>
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
          <span className="ml-auto hidden text-ink-tertiary sm:inline">Drag photos to reorder · shift-click selects a range</span>
        </div>

        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-hairline bg-surface-1 p-2" style={{ minHeight: 240 }}>
          {!data ? (
            <p className="py-10 text-center text-sm text-ink-subtle">{status || "Loading photos..."}</p>
          ) : (
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10" role="listbox" aria-label="Photos in gallery order" aria-multiselectable>
              {visible.map((id) => {
                const a = byId.get(id);
                if (!a) return null;
                const isSel = selected.has(id);
                const marker = drag?.over === id ? drag.pos : null;
                return (
                  <button
                    key={id}
                    type="button"
                    data-aid={id}
                    role="option"
                    aria-selected={isSel}
                    aria-label={`${a.filename}, position ${order.indexOf(id) + 1}`}
                    onClick={(e) => onTileClick(id, e)}
                    onPointerDown={(e) => onTilePointerDown(id, e)}
                    className={`group relative aspect-square select-none overflow-hidden rounded-md border bg-canvas outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${isSel ? "border-[var(--accent)] ring-2 ring-[var(--accent)]" : "border-hairline"} ${dragging && drag.ids.includes(id) ? "opacity-40" : ""} ${placing ? "cursor-crosshair" : "cursor-grab"}`}
                  >
                    {a.kind === "image" || a.kind === "video" ? (
                      // eslint-disable-next-line @next/next/no-img-element -- authorized proxy, no optimizer
                      <img src={`/api/assets/${id}?variant=thumb`} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[8px] uppercase text-ink-tertiary">{a.kind}</span>
                    )}
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] leading-4 text-white">{order.indexOf(id) + 1}</span>
                    {isSel && <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] text-white">✓</span>}
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 text-[9px] leading-4 text-white opacity-0 group-hover:opacity-100">{a.filename}</span>
                    {marker && (
                      <span
                        className="pointer-events-none absolute inset-y-0 w-1 bg-[var(--accent)]"
                        style={marker === "before" ? { left: 0 } : { right: 0 }}
                        aria-hidden
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {drag && (
          <div className="pointer-events-none fixed z-[100] -translate-x-1/2 -translate-y-1/2" style={{ left: drag.x, top: drag.y }}>
            <div className="relative h-16 w-16 overflow-hidden rounded-md border-2 border-[var(--accent)] bg-canvas shadow-xl">
              {/* eslint-disable-next-line @next/next/no-img-element -- authorized proxy, no optimizer */}
              <img src={`/api/assets/${drag.ids[0]}?variant=thumb`} alt="" className="h-full w-full object-cover" />
              {drag.ids.length > 1 && (
                <span className="absolute -right-0 -top-0 rounded-bl bg-[var(--accent)] px-1.5 text-[11px] font-semibold text-white">{drag.ids.length}</span>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
