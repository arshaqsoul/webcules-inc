import { PricingCalculator } from "@/components/app/pricing-calculator";
import { getLeadsWithProjects } from "@/lib/data";

export default async function PricingPage() {
  const rows = await getLeadsWithProjects();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pricing</h1>
        <p className="text-sm text-muted-foreground">
          The Saskatoon model — anchored against $2.5k–$10k studio quotes. Full policy in{" "}
          <code className="rounded bg-secondary px-1 py-0.5 text-xs">webcules-inc/docs/PRICING.md</code>.
        </p>
      </div>
      <PricingCalculator
        leads={rows.map(({ lead, project }) => ({
          id: lead.id,
          business: lead.business,
          current: project?.quoteOneTime ?? null,
        }))}
      />
    </div>
  );
}
