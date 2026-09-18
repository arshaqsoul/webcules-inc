import { notFound } from "next/navigation";

import { LeadDetail } from "@/components/app/lead-detail";
import { getLeadDetail, parseFindings, parseGrade } from "@/lib/data";
import { stripeEnabled } from "@/lib/stripe";

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getLeadDetail(id);
  if (!detail) notFound();

  const { lead, project, touches, pays, subscription } = detail;

  return (
    <LeadDetail
      lead={{
        id: lead.id,
        business: lead.business,
        industry: lead.industry ?? "",
        city: lead.city,
        siteUrl: lead.siteUrl ?? "",
        contactName: lead.contactName ?? "",
        email: lead.email ?? "",
        phone: lead.phone ?? "",
        stage: lead.stage,
        notes: lead.notes ?? "",
        lastTouchAt: lead.lastTouchAt ? new Date(lead.lastTouchAt).getTime() : null,
      }}
      project={
        project
          ? {
              id: project.id,
              slug: project.slug,
              previewUrl: project.previewUrl ?? "",
              repoUrl: project.repoUrl ?? "",
              pages: project.pages ?? 5,
              tier: project.tier ?? "standard",
              quoteOneTime: project.quoteOneTime,
              quoteMaintenance: project.quoteMaintenance,
              marketLow: project.marketLow,
              marketHigh: project.marketHigh,
              grade: parseGrade(project.gradeJson),
              findings: parseFindings(project.findingsJson),
            }
          : null
      }
      touches={touches.map((t) => ({
        id: t.id,
        channel: t.channel,
        kind: t.kind,
        subject: t.subject ?? "",
        body: t.body ?? "",
        status: t.status,
        createdAt: new Date(t.createdAt).getTime(),
      }))}
      pays={pays.map((p) => ({
        id: p.id,
        kind: p.kind,
        method: p.method,
        amountCents: p.amountCents,
        status: p.status,
        note: p.note ?? "",
        createdAt: new Date(p.createdAt).getTime(),
      }))}
      subscription={
        subscription
          ? { id: subscription.id, status: subscription.status, priceMonthlyCents: subscription.priceMonthlyCents }
          : null
      }
      stripeOn={stripeEnabled()}
    />
  );
}
