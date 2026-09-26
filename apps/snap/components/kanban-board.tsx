"use client";

/* Kanban pipeline — drag-drop between status columns with optimistic moves
 * and rollback on invalid transitions (the state machine rejects e.g.
 * booked → complete). */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
] as const;

export function KanbanBoard({ projects }: { projects: BoardProject[] }) {
  const router = useRouter();
  const [items, setItems] = useState(projects);
  const [dragging, setDragging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error?.startsWith("invalid_transition") ? "That move isn't allowed by the pipeline." : "Move failed — try again.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid grid-cols-1 gap-3 overflow-x-auto md:grid-cols-3 xl:grid-cols-5">
        {COLUMNS.map((col) => {
          const cards = items.filter((p) => p.status === col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragging) move(dragging, col.key);
                setDragging(null);
              }}
              className="flex min-w-[220px] flex-col gap-2 rounded-[12px] border border-hairline bg-surface-1 p-3"
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
