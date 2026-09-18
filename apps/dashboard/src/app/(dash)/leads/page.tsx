import { LeadsTable } from "@/components/app/leads-table";
import { getLeadsWithProjects } from "@/lib/data";

export default async function LeadsPage() {
  const rows = await getLeadsWithProjects();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
        <p className="text-sm text-muted-foreground">
          Every Saskatoon business on the radar — even the ones not redesigned yet. The list compounds; log everything.
        </p>
      </div>
      <LeadsTable
        rows={rows.map(({ lead, project }) => ({
          id: lead.id,
          business: lead.business,
          industry: lead.industry ?? "",
          siteUrl: lead.siteUrl ?? "",
          contact: lead.contactName || lead.email || lead.phone || "",
          stage: lead.stage,
          quote: project?.quoteOneTime ?? null,
          days: lead.lastTouchAt ? Math.floor((Date.now() - new Date(lead.lastTouchAt).getTime()) / 86400000) : null,
          createdAt: lead.createdAt ? new Date(lead.createdAt).getTime() : null,
        }))}
      />
    </div>
  );
}
