import { KanbanBoard } from "@/components/app/kanban-board";
import { getLeadsWithProjects } from "@/lib/data";

export default async function PipelinePage() {
  const rows = await getLeadsWithProjects();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
        <p className="text-sm text-muted-foreground">Drag-free kanban — use a card's menu to move it. Lost/parked lives at the end.</p>
      </div>
      <KanbanBoard
        rows={rows.map(({ lead, project }) => ({
          id: lead.id,
          business: lead.business,
          industry: lead.industry ?? "",
          stage: lead.stage,
          quote: project?.quoteOneTime ?? null,
          previewUrl: project?.previewUrl ?? "",
          days: lead.lastTouchAt ? Math.floor((Date.now() - new Date(lead.lastTouchAt).getTime()) / 86400000) : null,
        }))}
      />
    </div>
  );
}
