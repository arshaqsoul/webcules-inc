"use client";

/* Fast triage (WEB-122) — fullscreen card view: A/→/swipe-right approves,
 * X/←/swipe-left rejects, auto-advance, live counters, undo stack (last 20).
 * Touch handlers use pointer events with a horizontal-drag threshold so they
 * work on mobile Safari/Chrome without a gesture library. */
import { useCallback, useEffect, useRef, useState } from "react";

import type { AssetItem } from "@/components/project-files";

type UndoEntry = { id: string; from: string; to: string };

export function TriageMode({
  projectId,
  items,
  onClose,
  onDone,
}: {
  projectId: string;
  items: AssetItem[];
  onClose: () => void;
  onDone: () => void;
}) {
  // Triage walks the un-decided items (uploaded) first, then everything else.
  const order = useRef(
    [...items].sort((a, b) => (a.status === "uploaded" ? -1 : 1) - (b.status === "uploaded" ? -1 : 1)),
  );
  const [index, setIndex] = useState(0);
  const [counters, setCounters] = useState({ approved: 0, rejected: 0, pending: items.filter((i) => i.status === "uploaded").length });
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [flash, setFlash] = useState<"approved" | "rejected" | null>(null);
  const drag = useRef<{ x: number; active: boolean }>({ x: 0, active: false });
  const [dragDx, setDragDx] = useState(0);

  const current = order.current[index];
  const total = order.current.length;

  const act = useCallback(
    async (decision: "approved" | "rejected") => {
      if (!current || current.status === decision) {
        setIndex((i) => i + 1);
        return;
      }
      // Optimistically advance; undo restores both UI + server state.
      const prev = current.status;
      setUndoStack((s) => [...s.slice(-19), { id: current.id, from: prev, to: decision }]);
      setCounters((c) => ({
        approved: c.approved + (decision === "approved" ? 1 : 0),
        rejected: c.rejected + (decision === "rejected" ? 1 : 0),
        pending: Math.max(0, c.pending - (prev === "uploaded" ? 1 : 0)),
      }));
      setFlash(decision === "approved" ? "approved" : "rejected");
      setTimeout(() => setFlash(null), 350);
      setIndex((i) => i + 1);
      try {
        await fetch("/api/assets/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: decision === "approved" ? "approve" : "reject", assetIds: [current.id] }),
        });
      } catch {
        // server out of sync with UI — undo stack still allows correction
      }
    },
    [current],
  );

  const undo = useCallback(async () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setUndoStack((s) => s.slice(0, -1));
    setCounters((c) => ({
      approved: c.approved - (last.to === "approved" ? 1 : 0),
      rejected: c.rejected - (last.to === "rejected" ? 1 : 0),
      pending: c.pending + (last.from === "uploaded" ? 1 : 0),
    }));
    // step back to the card (cards are never removed from order)
    setIndex((i) => Math.max(0, i - 1));
    try {
      await fetch("/api/assets/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: last.from === "approved" ? "approve" : last.from === "rejected" ? "reject" : "reset",
          assetIds: [last.id],
        }),
      });
    } catch { /* next refresh reconciles */ }
  }, [undoStack]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "a") void act("approved");
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "x") void act("rejected");
      if (e.key.toLowerCase() === "z" && (e.metaKey || e.ctrlKey)) void undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, undo, onClose]);

  if (index >= total) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-canvas/97 backdrop-blur">
        <h2 className="text-xl font-semibold text-ink">Triage complete</h2>
        <p className="text-sm text-ink-subtle">
          {counters.approved} approved · {counters.rejected} rejected
        </p>
        <div className="flex gap-2">
          {undoStack.length > 0 && (
            <button onClick={() => void undo()} className="rounded-md border border-hairline px-3 py-1.5 text-sm text-ink-muted hover:bg-surface-2">
              Undo last
            </button>
          )}
          <button
            onClick={() => { onDone(); onClose(); }}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-white hover:brightness-110"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas/97 backdrop-blur">
      {/* HUD */}
      <div className="flex items-center gap-3 px-4 py-3 text-sm">
        <button onClick={onClose} className="rounded-md p-1.5 text-ink-subtle hover:bg-surface-2" aria-label="Exit triage">✕</button>
        <span className="text-ink-muted">{index + 1} / {total}</span>
        <span className="ml-auto flex gap-3 text-xs">
          <span className="text-success-text">{counters.approved} approved</span>
          <span className="text-destructive">{counters.rejected} rejected</span>
          <span className="text-ink-tertiary">{counters.pending} pending</span>
        </span>
        {undoStack.length > 0 && (
          <button onClick={() => void undo()} className="rounded-md border border-hairline px-2 py-1 text-xs text-ink-muted hover:bg-surface-2">
            Undo (⌘Z)
          </button>
        )}
      </div>

      {/* Card */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-6 pb-8">
        <div
          role="img"
          aria-label={current.filename}
          className="relative max-h-full w-full max-w-3xl touch-pan-y select-none overflow-hidden rounded-[16px] border border-hairline bg-surface-1 shadow-lg"
          style={{
            transform: `translateX(${dragDx}px) rotate(${dragDx * 0.04}deg)`,
            transition: drag.current.active ? "none" : "transform 200ms ease-out",
          }}
          onPointerDown={(e) => { drag.current = { x: e.clientX, active: true }; setDragDx(0); }}
          onPointerMove={(e) => {
            if (!drag.current.active) return;
            setDragDx(e.clientX - drag.current.x);
          }}
          onPointerUp={() => {
            if (!drag.current.active) return;
            drag.current.active = false;
            if (dragDx > 110) void act("approved");
            else if (dragDx < -110) void act("rejected");
            setDragDx(0);
          }}
          onPointerCancel={() => { drag.current.active = false; setDragDx(0); }}
        >
          {current.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element -- authorized proxy, no optimizer
            <img src={`/api/assets/${current.id}`} alt={current.filename} className="max-h-[70vh] w-full object-contain" draggable={false} />
          ) : current.kind === "video" ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption -- triage video
            <video src={`/api/assets/${current.id}`} controls playsInline className="max-h-[70vh] w-full" />
          ) : (
            <div className="flex aspect-video flex-col items-center justify-center gap-2 text-ink-tertiary">
              <span className="text-xs font-semibold uppercase tracking-widest">{current.kind}</span>
              <span className="text-sm">{current.filename}</span>
            </div>
          )}
          {/* Decision flash */}
          <div
            className={`pointer-events-none absolute inset-0 flex items-center justify-center border-4 transition-opacity ${flash ? "opacity-100" : "opacity-0"}`}
            style={{ borderColor: flash === "approved" ? "#1e8e3e" : flash === "rejected" ? "#cc3d3d" : "transparent" }}
          >
            {flash && <span className="rounded-full px-4 py-1.5 text-sm font-semibold text-white" style={{ background: flash === "approved" ? "#1e8e3e" : "#cc3d3d" }}>{flash}</span>}
          </div>
          <span className="absolute bottom-2 left-3 rounded-full bg-black/45 px-2.5 py-1 text-xs text-white">{current.filename}</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 pb-6 text-xs text-ink-tertiary">
        <button onClick={() => void act("rejected")} className="rounded-md border border-hairline px-3 py-1.5 text-sm text-destructive hover:bg-destructive/5">✕ Reject (X / ←)</button>
        <button onClick={() => void act("approved")} className="rounded-md border border-hairline px-3 py-1.5 text-sm text-success-text hover:bg-success/5">✓ Approve (A / →)</button>
        <span className="hidden sm:inline">· swipe on touch</span>
      </div>
    </div>
  );
}
