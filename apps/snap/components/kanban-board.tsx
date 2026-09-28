"use client";

/* Kanban pipeline — free drag-drop between all status columns (every move is
 * allowed and reversible) with optimistic updates, rollback on failure, and a
 * transient notice confirming what changed. The only automation left is the
 * daily cron that advances booked → snapping on the event date. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type BoardProject = {
  id: string;
  title: string;
  status: string;
  eventDate: string | null;
  clientName: string | null;
  clientEmail: string | null;
  /** WEB-135: derived money state — unpaid | partial | paid | overpaid | none. */
  payStatus?: "unpaid" | "partial" | "paid" | "overpaid" | "none";
};

const COLUMNS = [
  { key: "booked", label: "Booked", accent: "#5e6ad2" },
  { key: "snapping", label: "Snapping", accent: "#e5912d" },
  { key: "evaluation", label: "Evaluation", accent: "#8f5fee" },
  { key: "complete", label: "Complete", accent: "#1e8e3e" },
  { key: "closed", label: "Closed", accent: "#8a8f98" },
  { key: "canceled", label: "Canceled", accent: "#c0271f" },
] as const;

const LABEL: Record<string, string> = Object.fromEntries(COLUMNS.map((c) => [c.key, c.label]));

export function KanbanBoard({ projects }: { projects: BoardProject[] }) {
  const router = useRouter();
  const [items, setItems] = useState(projects);
  const [dragging, setDragging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  function flashNotice(text: string) {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }

  async function move(projectId: string, toStatus: string) {
    const project = items.find((p) => p.id === projectId);
    if (!project || project.status === toStatus) return;
    const prev = items;
    setItems((cur) => cur.map((p) => (p.id === projectId ? { ...p, status: toStatus } : p)));
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toStatus }),
    });
    if (!res.ok) {
      setItems(prev);
      setError("Move failed — try again.");
      return;
    }
    flashNotice(`“${project.title}” moved to ${LABEL[toStatus] ?? toStatus}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {(error || notice) && (
        <p
          className={`rounded-md px-3 py-1.5 text-xs ${
            error ? "bg-destructive/10 text-destructive" : "bg-surface-2 text-ink-muted"
          }`}
        >
          {error ?? notice}
        </p>
      )}
      {/* Linear-style lanes: one horizontal scroller at every breakpoint —
       * fixed-width lanes never wrap or stack, the row scrolls (touch on
       * mobile), and -mx-6/px-6 bleeds to the main padding's edges so lanes
       * stay aligned with the rest of the content. */}
      <div className="-mx-6 flex snap-x snap-proximity gap-3 overflow-x-auto px-6 pb-2">
        {COLUMNS.map((col) => {
          const cards = items.filter((p) => p.status === col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragging) void move(dragging, col.key);
                setDragging(null);
              }}
              className="flex w-[272px] shrink-0 snap-start flex-col gap-2 rounded-[12px] border border-hairline bg-surface-1 p-3 md:w-[300px]"
            >
              <div className="flex items-center justify-between px-1">
                <span className="flex items-center gap-2 text-[13px] font-medium text-ink">
                  <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: col.accent }} />
                  {col.label}
                </span>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-subtle">{cards.length}</span>
              </div>
              {cards.length === 0 && (
                <p className="px-1 py-4 text-center text-xs text-ink-tertiary">Drop here</p>
              )}
              {cards.map((p) => (
                <div
                  key={p.id}
                  draggable
                  onDragStart={() => setDragging(p.id)}
                  onDragEnd={() => setDragging(null)}
                  className={`cursor-grab rounded-lg border border-hairline bg-background p-3 transition-shadow hover:shadow-sm ${dragging === p.id ? "opacity-50" : ""}`}
                >
                  <Link href={`/dashboard/projects/${p.id}`} className="block text-sm font-medium text-ink hover:text-primary">
                    {p.title}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-ink-subtle">{p.clientName ?? p.clientEmail}</p>
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-tertiary">
                    {p.eventDate && (
                      <span>📅 {new Date(p.eventDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    )}
                    {p.payStatus && p.payStatus !== "none" && (
                      <span
                        title={`Payment ${p.payStatus}`}
                        className={
                          p.payStatus === "paid"
                            ? "rounded-full bg-success/10 px-1.5 py-0.5 font-medium text-success-text"
                            : p.payStatus === "partial"
                              ? "rounded-full bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-600 dark:text-amber-400"
                              : p.payStatus === "overpaid"
                                ? "rounded-full bg-sky-500/10 px-1.5 py-0.5 font-medium text-sky-600 dark:text-sky-400"
                                : "rounded-full bg-destructive/10 px-1.5 py-0.5 font-medium text-destructive"
                        }
                      >
                        $ {p.payStatus}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
