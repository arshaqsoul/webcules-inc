import { redirect } from "next/navigation";

import { KanbanBoard } from "@/components/kanban-board";
import { listProjects } from "@/lib/repos/projects";
import { getOrgPaymentStatuses } from "@/lib/repos/payments";
import { getOrgContext } from "@/lib/session";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  const [projects, payStatuses] = await Promise.all([
    listProjects(ctx.organizationId),
    getOrgPaymentStatuses(ctx.organizationId),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.6px] text-ink">Projects</h1>
        <p className="mt-1 text-sm text-ink-subtle">
          Drag cards across the pipeline — Booked → Snapping → Evaluation → Complete → Closed.
        </p>
      </div>
      {projects.length === 0 ? (
        <div className="rounded-[12px] border border-hairline bg-surface-1 p-8 text-center text-sm text-ink-subtle">
          No projects yet — convert a lead or take a booking and it lands here automatically.
        </div>
      ) : (
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
      )}
    </div>
  );
}
