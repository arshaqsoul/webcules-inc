import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { LeadThread } from "@/components/lead-thread";
import { getLeadWithThread } from "@/lib/repos/leads";
import { getOrgContext } from "@/lib/session";

export const metadata = { title: "Lead" };

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  const { id } = await params;

  const data = await getLeadWithThread(ctx.organizationId, id);
  if (!data) notFound();
  const { lead, messages } = data;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <Link href="/dashboard/leads" className="flex items-center gap-1.5 text-sm text-ink-subtle hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to leads
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.6px] text-ink">{lead.name}</h1>
        <p className="mt-1 text-sm text-ink-subtle">
          {lead.email}
          {lead.phone ? ` · ${lead.phone}` : ""}
          {lead.eventType ? ` · ${lead.eventType}` : ""}
          {lead.eventDate ? ` · ${lead.eventDate.toISOString().slice(0, 10)}` : ""}
        </p>
      </div>

      <LeadThread
        leadId={lead.id}
        leadName={lead.name}
        leadStatus={lead.status}
        leadMessage={lead.message ?? ""}
        messages={messages.map((m) => ({
          id: m.id,
          direction: m.direction,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
