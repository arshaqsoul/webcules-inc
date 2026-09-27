"use client";

/* Quiet status picker for the project header — the badge itself opens the
 * menu (Linear-style). Every move is free and reversible; the kanban board
 * is the primary surface, this is the shortcut from the detail page. */
import { Check, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const STATUSES = [
  { key: "booked", label: "Booked", accent: "#5e6ad2" },
  { key: "snapping", label: "In editing", accent: "#e5912d" },
  { key: "evaluation", label: "In review", accent: "#8f5fee" },
  { key: "complete", label: "Delivered", accent: "#1e8e3e" },
  { key: "closed", label: "Closed", accent: "#8a8f98" },
  { key: "canceled", label: "Canceled", accent: "#c0271f" },
] as const;

export function ProjectStatusMenu({ projectId, status }: { projectId: string; status: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function pick(to: string) {
    if (to === status || busy) return;
    setBusy(to);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStatus: to }),
      });
      if (!res.ok) {
        setError("Move failed — try again.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(null);
    }
  }

  const current = STATUSES.find((s) => s.key === status);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full border border-hairline bg-surface-1 px-3 py-1 text-xs font-medium uppercase tracking-wide text-ink-muted transition-colors hover:bg-surface-2"
      >
        <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: current?.accent ?? "#8a8f98" }} />
        {current?.label ?? status}
        <ChevronDown className="h-3 w-3" aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1.5 w-52 rounded-[10px] border border-hairline bg-surface-1 p-1 shadow-lg">
          <p className="px-2 py-1 text-[11px] uppercase tracking-wide text-ink-tertiary">Move to</p>
          {STATUSES.map((s) => (
            <button
              key={s.key}
              type="button"
              disabled={busy !== null}
              onClick={() => void pick(s.key)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-surface-2 disabled:opacity-60"
            >
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: s.accent }} />
              {busy === s.key ? "Moving…" : s.label}
              {s.key === status && <Check className="ml-auto h-3.5 w-3.5 text-ink-tertiary" aria-hidden />}
            </button>
          ))}
          {error && <p className="px-2 py-1 text-[11px] text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
