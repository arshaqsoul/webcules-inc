import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ProjectFiles } from "@/components/project-files";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { listAssets } from "@/lib/repos/assets";
import { getOrgContext } from "@/lib/session";
import { and, eq } from "drizzle-orm";

export const metadata = { title: "Project" };

const STATUS_ACCENT: Record<string, string> = {
  booked: "#5e6ad2",
  snapping: "#e5912d",
  evaluation: "#8f5fee",
  complete: "#1e8e3e",
  closed: "#8a8f98",
};

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  const { id } = await params;

  const db = getDb();
  const project = (
    await db
      .select()
      .from(schema.projects)
      .where(and(eq(schema.projects.id, id), eq(schema.projects.organizationId, ctx.organizationId)))
      .limit(1)
  )[0];
  if (!project) notFound();

  const [client] = project.clientId
    ? await db.select().from(schema.clients).where(eq(schema.clients.id, project.clientId)).limit(1)
    : [null];

  const [events, assets] = await Promise.all([
    db
      .select()
      .from(schema.projectStatusEvents)
      .where(eq(schema.projectStatusEvents.projectId, id))
      .orderBy(schema.projectStatusEvents.createdAt),
    listAssets(ctx.organizationId, id),
  ]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <Link href="/dashboard/projects" className="flex items-center gap-1.5 text-sm text-ink-subtle hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All projects
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_ACCENT[project.status] ?? "#8a8f98" }} />
            <h1 className="text-2xl font-semibold tracking-[-0.6px] text-ink">{project.title}</h1>
          </div>
          <p className="mt-1 text-sm text-ink-subtle">
            {client?.name ?? project.title}
            {client?.email ? ` · ${client.email}` : ""}
            {project.eventDate ? ` · ${project.eventDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}` : ""}
          </p>
        </div>
        <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium uppercase tracking-wide text-ink-muted">
          {project.status}
        </span>
      </div>

      <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <h2 className="text-[15px] font-medium text-ink">Files</h2>
        <p className="mb-4 mt-1 text-xs text-ink-subtle">
          Upload the shoot, approve/reject in the grid. Shared files are locked.
        </p>
        <ProjectFiles
          projectId={id}
          assets={assets.map((a) => ({
            id: a.id,
            filename: a.filename,
            kind: a.kind,
            status: a.status,
            bytes: a.bytes,
            createdAt: a.createdAt.toISOString(),
          }))}
        />
      </section>

      <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <h2 className="text-[15px] font-medium text-ink">Activity</h2>
        <div className="mt-3 flex flex-col gap-3">
          {events.length === 0 && <p className="text-sm text-ink-subtle">No status changes yet.</p>}
          {events.map((e) => (
            <div key={e.id} className="flex items-center gap-3 text-sm">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_ACCENT[e.toStatus] ?? "#8a8f98" }} />
              <span className="text-ink">
                {e.fromStatus ? `${e.fromStatus} → ${e.toStatus}` : `created as ${e.toStatus}`}
              </span>
              {e.note && <span className="text-xs text-ink-tertiary">{e.note}</span>}
              <span className="ml-auto text-xs text-ink-tertiary">
                {e.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
