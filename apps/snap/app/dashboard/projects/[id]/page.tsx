import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ProjectFiles } from "@/components/project-files";
import { ProjectGalleries } from "@/components/project-galleries";
import { ProjectPayments } from "@/components/project-payments";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { listAssets } from "@/lib/repos/assets";
import { getProjectAuditActivity } from "@/lib/repos/audit";
import { listPayments } from "@/lib/repos/payments";
import { getProjectShareActivity, listProjectGrants } from "@/lib/shares/grants";
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

  const [events, assets, grants, shareActivity, payments, auditEvents] = await Promise.all([
    db
      .select()
      .from(schema.projectStatusEvents)
      .where(eq(schema.projectStatusEvents.projectId, id))
      .orderBy(schema.projectStatusEvents.createdAt),
    listAssets(ctx.organizationId, id),
    listProjectGrants(ctx.organizationId, id),
    getProjectShareActivity(ctx.organizationId, id),
    listPayments(ctx.organizationId, { projectId: id }),
    getProjectAuditActivity(ctx.organizationId, id),
  ]);
  const approvedCount = assets.filter((a) => a.status === "approved" || a.status === "shared").length;

  // One chronological feed: pipeline status events + gallery access audit +
  // system/user audit trail (payments, bulk curation runs).
  const GALLERY_EVENT_LABEL: Record<string, string> = {
    view: "opened the gallery",
    otp_sent: "requested a verification code",
    otp_success: "verified by email code",
    otp_fail: "failed a code check",
    download: "downloaded a file",
  };
  const AUDIT_EVENT_LABEL: Record<string, (meta: Record<string, unknown>) => string> = {
    "payment.refund_requested": () => "issued a refund",
    "booking.payment_confirmed": () => "booking payment confirmed",
    "asset.bulk_approve": (m) => `bulk approved ${m.count ?? ""} files`.trim(),
    "asset.bulk_reject": (m) => `bulk rejected ${m.count ?? ""} files`.trim(),
    "asset.bulk_delete": (m) => `bulk deleted ${m.count ?? ""} files`.trim(),
    "asset.bulk_tag": (m) => `tagged ${m.count ?? ""} files${m.tag ? ` "${String(m.tag)}"` : ""}`.trim(),
    "asset.bulk_untag": (m) => `untagged ${m.count ?? ""} files${m.tag ? ` "${String(m.tag)}"` : ""}`.trim(),
    "asset.delete_blocked": () => "delete blocked — active client gallery",
    "asset.reject_blocked": () => "reject blocked — active client gallery",
    "share.grant.created": () => "created a client gallery link",
    "share.grant.revoked": () => "revoked a client gallery link",
    "share.grant.regenerated": () => "rotated a client gallery link",
    "asset.raw_archive": (m) => `RAW vault: ${m.n ?? "?"} file${Number(m.n) === 1 ? "" : "s"} moved to cold storage (restorable)`,
    "asset.raw_restore": (m) =>
      `RAW vault: ${[m.restored ? `${m.restored} restored` : null, m.extended ? `${m.extended} kept hot` : null].filter(Boolean).join(", ") || "renewed"}`,
    "asset.raw_purge": (m) => `RAW vault: ${m.n ?? "?"} file${Number(m.n) === 1 ? "" : "s"} permanently deleted after final warnings`,
  };
  const feed = [
    ...events.map((e) => ({
      key: e.id,
      at: e.createdAt,
      dot: STATUS_ACCENT[e.toStatus] ?? "#8a8f98",
      label: e.fromStatus ? `${e.fromStatus} → ${e.toStatus}` : `created as ${e.toStatus}`,
      note: e.note ?? null,
    })),
    ...shareActivity.map((a) => ({
      key: a.id,
      at: new Date(a.createdAt),
      dot: "#5e6ad2",
      label: `${a.clientEmail.split("@")[0]} ${GALLERY_EVENT_LABEL[a.event] ?? a.event}`,
      note: null,
    })),
    ...auditEvents.map((e) => {
      const label = AUDIT_EVENT_LABEL[e.action]?.(e.meta);
      return {
        key: e.id,
        at: new Date(e.createdAt),
        dot: "#8f5fee",
        label: label ?? e.action.replace(/[._]/g, " "),
        note: e.blocked ? `${e.blocked} blocked` : null,
      };
    }),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

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
          Upload the shoot, triage with Triage, curate in the grid — shared files are locked.
        </p>
        <ProjectFiles projectId={id} />
      </section>

      <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <h2 className="text-[15px] font-medium text-ink">Client gallery</h2>
        <p className="mb-4 mt-1 text-xs text-ink-subtle">
          Send a secure link — the client verifies by email code, and you can revoke or rotate it any time.
        </p>
        <ProjectGalleries
          projectId={id}
          clientEmail={client?.email ?? ""}
          approvedCount={approvedCount}
          grants={grants}
        />
      </section>

      <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <h2 className="text-[15px] font-medium text-ink">Payments</h2>
        <p className="mb-4 mt-1 text-xs text-ink-subtle">
          Booking payments for this project. Refunds cancel the booking and email the client.
        </p>
        <ProjectPayments
          payments={payments.map((p) => ({
            id: p.id,
            kind: p.kind,
            amountMinor: p.amountMinor,
            currency: p.currency,
            status: p.status,
            occurredAt: p.occurredAt,
          }))}
        />
      </section>

      <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <h2 className="text-[15px] font-medium text-ink">Activity</h2>
        <div className="mt-3 flex flex-col gap-3">
          {feed.length === 0 && <p className="text-sm text-ink-subtle">No activity yet.</p>}
          {feed.map((e) => (
            <div key={e.key} className="flex items-center gap-3 text-sm">
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: e.dot }}
              />
              <span className="text-ink">{e.label}</span>
              {e.note && <span className="text-xs text-ink-tertiary">{e.note}</span>}
              <span className="ml-auto text-xs text-ink-tertiary">
                {e.at.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
