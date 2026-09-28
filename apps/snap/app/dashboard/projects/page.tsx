import { Suspense } from "react";
import { redirect } from "next/navigation";

import { KanbanBoard } from "@/components/kanban-board";
import { listProjects } from "@/lib/repos/projects";
import { getOrgPaymentStatuses } from "@/lib/repos/payments";
import { getOrgContext } from "@/lib/session";

export const metadata = { title: "Projects" };

/* The board streams in behind a skeleton INSIDE the page (not a route
 * loading.tsx) — route-level boundaries re-show on every searchParams
 * change, which flashed a skeleton on each project-hub tab switch. */
export default function ProjectsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.6px] text-ink">Projects</h1>
        <p className="mt-1 text-sm text-ink-subtle">
          Drag cards across the pipeline — Booked → Snapping → Evaluation → Complete → Closed.
        </p>
      </div>
      <Suspense fallback={<BoardSkeleton />}>
        <Board />
      </Suspense>
    </div>
  );
}

async function Board() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  const [projects, payStatuses] = await Promise.all([
    listProjects(ctx.organizationId),
    getOrgPaymentStatuses(ctx.organizationId),
  ]);

  if (projects.length === 0) {
    return (
      <div className="rounded-[12px] border border-hairline bg-surface-1 p-8 text-center text-sm text-ink-subtle">
        No projects yet — convert a lead or take a booking and it lands here automatically.
      </div>
    );
  }
  return (
    <KanbanBoard
      projects={projects.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        eventDate: p.eventDate ? p.eventDate.toISOString() : null,
        clientName: p.clientName ?? null,
        clientEmail: p.clientEmail ?? null,
        payStatus: payStatuses.get(p.id)?.status ?? "none",
      }))}
    />
  );
}

function BoardSkeleton() {
  return (
    <div className="-mx-6 flex min-h-0 flex-1 gap-3 overflow-hidden px-6" aria-busy="true" aria-label="Loading projects">
      {[0, 1, 2, 3, 4, 5].map((col) => (
        <div key={col} className="flex w-[272px] shrink-0 flex-col gap-2 rounded-[12px] border border-hairline bg-surface-1 p-3 md:w-[300px]">
          <div className="flex items-center justify-between px-1">
            <div className="h-3 w-20 animate-pulse rounded bg-surface-2" />
            <div className="h-4 w-6 animate-pulse rounded-full bg-surface-2" />
          </div>
          {[0, 1].map((card) => (
            <div key={card} className="h-[76px] animate-pulse rounded-lg border border-hairline bg-background" />
          ))}
        </div>
      ))}
    </div>
  );
}
