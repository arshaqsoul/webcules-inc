import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { LeadEdit } from "@/components/lead-edit";
import { LeadConversation } from "@/components/lead-conversation";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getLeadWithThread } from "@/lib/repos/leads";
import { getProjectByLeadId } from "@/lib/repos/projects";
import { getOrgContext } from "@/lib/session";
import { unpackLeadCustomFields } from "@/lib/forms";

export const metadata = { title: "Lead" };

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  const { id } = await params;

  const data = await getLeadWithThread(ctx.organizationId, id);
  if (!data) notFound();
  const { lead, messages } = data;
  const project = lead.status === "converted" ? await getProjectByLeadId(ctx.organizationId, lead.id) : undefined;
  const customFields = unpackLeadCustomFields(lead.customFields);
  // WEB-308: the conversation lives in the Inbox — link to its thread.
  const thread = (
    await getDb()
      .select({ id: schema.threads.id })
      .from(schema.threads)
      .where(eq(schema.threads.leadId, lead.id))
      .limit(1)
  )[0];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <Link href="/dashboard/leads" className="flex items-center gap-1.5 text-sm text-ink-subtle hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to leads
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.6px] text-ink">{lead.name}</h1>
          <p className="mt-1 text-sm text-ink-subtle">
            {lead.email}
            {lead.phone ? ` · ${lead.phone}` : ""}
            {lead.eventType ? ` · ${lead.eventType}` : ""}
            {lead.eventDate ? ` · ${lead.eventDate.toISOString().slice(0, 10)}` : ""}
            {project ? (
              <>
                {" · "}
                <Link
                  href={`/dashboard/projects/${project.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {project.title}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <LeadEdit
          lead={{
            id: lead.id,
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            eventType: lead.eventType,
            eventDate: lead.eventDate ? lead.eventDate.toISOString().slice(0, 10) : null,
            message: lead.message,
          }}
        />
      </div>

      {customFields.length > 0 && (
        <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
          <h2 className="text-[15px] font-medium text-ink">Form answers</h2>
          <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            {customFields.map((f, i) => (
              <div key={i}>
                <dt className="text-xs text-ink-tertiary">{f.label}</dt>
                <dd className="whitespace-pre-wrap text-sm text-ink">
                  {f.file ? (
                    <a href={`/api/studio/forms/file?key=${encodeURIComponent(f.file.key)}`} className="font-medium text-primary hover:underline">
                      {f.value}
                    </a>
                  ) : (
                    f.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <LeadConversation
        threadId={thread?.id ?? null}
        recentMessages={messages.map((m) => ({
          id: m.id,
          direction: m.direction,
          body: m.body.slice(0, 120),
          createdAt: m.createdAt.toISOString(),
        }))}
        leadId={lead.id}
        leadName={lead.name}
        leadEmail={lead.email}
        leadEventType={lead.eventType}
        leadEventDate={lead.eventDate ? lead.eventDate.toISOString().slice(0, 10) : null}
        leadStatus={lead.status}
        projectId={project?.id ?? null}
        projectTitle={project?.title ?? null}
      />
    </div>
  );
}
