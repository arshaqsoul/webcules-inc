import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ProjectFiles } from "@/components/project-files";
import { ProjectGalleries } from "@/components/project-galleries";
import { ProjectPayments } from "@/components/project-payments";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { listAssets } from "@/lib/repos/assets";
import { listFolders } from "@/lib/repos/folders";
import { getProjectAuditActivity } from "@/lib/repos/audit";
import { getProjectPaymentSummary, listPayments } from "@/lib/repos/payments";
import { listProjectInvoices } from "@/lib/invoices";
import { ProjectInvoices } from "@/components/project-invoices";
import { listProjectContracts } from "@/lib/contracts";
import { ProjectContracts } from "@/components/project-contracts";
import { ProjectStatusMenu } from "@/components/project-status-menu";
import { ProjectDateControl } from "@/components/project-date-control";
import { ProjectNotes } from "@/components/project-notes";
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
  canceled: "#c0271f",
};

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "files", label: "Files" },
  { key: "gallery", label: "Client gallery" },
  { key: "payments", label: "Payments & invoices" },
  { key: "contracts", label: "Contracts" },
  { key: "activity", label: "Activity" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  const { id } = await params;
  const tabParam = (await searchParams).tab;
  const tab: Tab = TABS.some((t) => t.key === tabParam) ? (tabParam as Tab) : "overview";

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

  // Load only what the active tab renders — the Files workspace fetches its
  // own asset grid client-side.
  const [events, shareActivity, auditEvents, assets, grants, deliverFolders, payments, paymentSummary, invoices, contractsRows] =
    await Promise.all([
      tab === "overview" || tab === "activity"
        ? db
            .select()
            .from(schema.projectStatusEvents)
            .where(eq(schema.projectStatusEvents.projectId, id))
            .orderBy(schema.projectStatusEvents.createdAt)
        : Promise.resolve([] as (typeof schema.projectStatusEvents.$inferSelect)[]),
      tab === "activity" ? getProjectShareActivity(ctx.organizationId, id) : Promise.resolve([]),
      tab === "activity" ? getProjectAuditActivity(ctx.organizationId, id) : Promise.resolve([]),
      tab === "gallery" ? listAssets(ctx.organizationId, id) : Promise.resolve([]),
      tab === "gallery" ? listProjectGrants(ctx.organizationId, id) : Promise.resolve([]),
      // WEB-216: folder-level delivery — chips with approved/shared counts.
      tab === "gallery" ? listFolders(ctx.organizationId, id, { statuses: ["approved", "shared"] }) : Promise.resolve({ folders: [], unfiledCount: 0 }),
      tab === "payments" ? listPayments(ctx.organizationId, { projectId: id }) : Promise.resolve([]),
      tab === "payments" ? getProjectPaymentSummary(ctx.organizationId, id) : Promise.resolve(null),
      tab === "payments" ? listProjectInvoices(ctx.organizationId, id) : Promise.resolve([]),
      tab === "contracts" ? listProjectContracts(ctx.organizationId, id) : Promise.resolve([]),
    ]);

  return (
    <div className="flex flex-col gap-5">
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
        <div className="flex flex-col items-end gap-2">
          <ProjectStatusMenu projectId={project.id} status={project.status} />
          {!project.eventDate && <ProjectDateControl projectId={project.id} />}
        </div>
      </div>

      <nav className="flex flex-wrap gap-1.5" aria-label="Project sections">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/dashboard/projects/${id}?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              tab === t.key ? "bg-surface-2 text-ink" : "text-ink-subtle hover:bg-surface-1 hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "overview" && (
        <>
          <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
            <h2 className="text-[15px] font-medium text-ink">Details</h2>
            <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-ink-tertiary">Client</dt>
                <dd className="text-sm text-ink">
                  {client ? (
                    <>
                      {client.name ?? client.email}
                      {client.email && <span className="block text-xs text-ink-subtle">{client.email}</span>}
                      {client.phone && <span className="block text-xs text-ink-subtle">{client.phone}</span>}
                    </>
                  ) : (
                    <span className="text-ink-subtle">No client linked</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-tertiary">Event date</dt>
                <dd className="text-sm text-ink">
                  {project.eventDate ? (
                    project.eventDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
                  ) : (
                    <span className="text-ink-subtle">Not set — use “Add event date” above</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-tertiary">Status</dt>
                <dd className="flex items-center gap-2 text-sm text-ink">
                  <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: STATUS_ACCENT[project.status] ?? "#8a8f98" }} />
                  {project.status}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-tertiary">Created</dt>
                <dd className="text-sm text-ink">
                  {project.createdAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
            <h2 className="text-[15px] font-medium text-ink">Notes</h2>
            <p className="mb-3 mt-1 text-xs text-ink-subtle">Private to your studio — never shown to the client.</p>
            <ProjectNotes projectId={id} initialNotes={project.notes ?? ""} />
          </section>

          <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
            <h2 className="text-[15px] font-medium text-ink">Status timeline</h2>
            <div className="mt-3 flex flex-col">
              {events.length === 0 && <p className="text-sm text-ink-subtle">No status changes yet.</p>}
              {events.map((e, i) => (
                <div key={e.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_ACCENT[e.toStatus] ?? "#8a8f98" }} />
                    {i < events.length - 1 && <span aria-hidden className="w-px flex-1 bg-hairline" />}
                  </div>
                  <div className="pb-4">
                    <p className="text-sm text-ink">
                      {e.fromStatus ? `${e.fromStatus} → ${e.toStatus}` : `created as ${e.toStatus}`}
                    </p>
                    {e.note && <p className="mt-0.5 text-xs text-ink-subtle">{e.note}</p>}
                    <p className="mt-0.5 text-xs text-ink-tertiary">
                      {e.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {tab === "files" && (
        <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
          <h2 className="text-[15px] font-medium text-ink">Files</h2>
          <p className="mb-4 mt-1 text-xs text-ink-subtle">
            Upload the shoot, triage with Triage, curate in the grid — shared files are locked.
          </p>
          <ProjectFiles projectId={id} clientEmail={client?.email} />
        </section>
      )}

      {tab === "gallery" && (
        <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
          <h2 className="text-[15px] font-medium text-ink">Client gallery</h2>
          <p className="mb-4 mt-1 text-xs text-ink-subtle">
            Send a secure link — the client verifies by email code, and you can revoke or rotate it any time.
          </p>
          <ProjectGalleries
            projectId={id}
            clientEmail={client?.email ?? ""}
            approvedCount={assets.filter((a) => a.status === "approved" || a.status === "shared").length}
            folders={deliverFolders.folders}
            grants={grants}
          />
        </section>
      )}

      {tab === "payments" && paymentSummary && (
        <>
          <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
            <h2 className="text-[15px] font-medium text-ink">Payments</h2>
            <p className="mb-4 mt-1 text-xs text-ink-subtle">
              Booking payments for this project. Refunds cancel the booking and email the client.
            </p>
            <ProjectPayments
              projectId={id}
              payments={payments.map((p) => ({
                id: p.id,
                kind: p.kind,
                amountMinor: p.amountMinor,
                currency: p.currency,
                status: p.status,
                occurredAt: p.occurredAt,
                method: p.method ?? null,
                note: p.note ?? null,
                stripePaymentIntentId: p.stripePaymentIntentId ?? null,
              }))}
              summary={{
                quotedTotalMinor: paymentSummary.quotedTotalMinor,
                currency: paymentSummary.currency,
                collectedMinor: paymentSummary.collectedMinor,
                refundedMinor: paymentSummary.refundedMinor,
                status: paymentSummary.status,
                paymentCount: paymentSummary.paymentCount,
              }}
            />
          </section>
          <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
            <h2 className="text-[15px] font-medium text-ink">Invoices</h2>
            <p className="mb-4 mt-1 text-xs text-ink-subtle">Branded, numbered invoices with secure client links.</p>
            <ProjectInvoices
              projectId={id}
              invoices={invoices.map((inv) => ({
                id: inv.id,
                number: inv.number,
                status: inv.status,
                totalMinor: inv.totalMinor,
                currency: inv.currency,
                clientEmail: inv.clientEmail ?? null,
                issuedAt: inv.issuedAt ? inv.issuedAt.toISOString() : null,
                dueAt: inv.dueAt ? inv.dueAt.toISOString() : null,
                hasPdf: Boolean(inv.pdfKey),
              }))}
              clientEmail={client?.email ?? null}
              quotedTotalMinor={paymentSummary.quotedTotalMinor}
            />
          </section>
        </>
      )}

      {tab === "contracts" && (
        <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
          <h2 className="text-[15px] font-medium text-ink">Contracts</h2>
          <p className="mb-4 mt-1 text-xs text-ink-subtle">
            Send agreements for e-signature — typed signature, IP and timestamp recorded.
          </p>
          <ProjectContracts
            projectId={id}
            contracts={contractsRows.map((c) => ({
              id: c.id,
              title: c.title,
              status: c.status,
              clientEmail: c.clientEmail ?? null,
              sentAt: c.sentAt ? c.sentAt.toISOString() : null,
              signedAt: c.signedAt ? c.signedAt.toISOString() : null,
              signerName: c.signerName ?? null,
              hasPdf: Boolean(c.pdfKey),
            }))}
            clientEmail={client?.email ?? null}
          />
        </section>
      )}

      {tab === "activity" && <ActivityTab organizationId={ctx.organizationId} projectId={id} events={events} shareActivity={shareActivity} auditEvents={auditEvents} />}
    </div>
  );
}

/* One chronological feed: pipeline status events + gallery access audit +
 * system/user audit trail (payments, bulk curation runs, notes edits). */
function ActivityTab({
  events,
  shareActivity,
  auditEvents,
}: {
  organizationId: string;
  projectId: string;
  events: (typeof schema.projectStatusEvents.$inferSelect)[];
  shareActivity: Awaited<ReturnType<typeof getProjectShareActivity>>;
  auditEvents: Awaited<ReturnType<typeof getProjectAuditActivity>>;
}) {
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
    "asset.bulk_rename": (m) => `renamed ${m.count ?? ""} files to "${String(m.base ?? "")}…"`.trim(),
    "asset.delete_blocked": () => "delete blocked — active client gallery",
    "asset.reject_blocked": () => "reject blocked — active client gallery",
    "asset.rejected_purge": (m) =>
      `purged ${m.deleted ?? 0} rejected file${Number(m.deleted) === 1 ? "" : "s"}${m.skipped ? ` · ${m.skipped} skipped (active gallery)` : ""}`,
    "share.grant.created": () => "created a client gallery link",
    "share.grant.revoked": () => "revoked a client gallery link",
    "share.grant.regenerated": () => "rotated a client gallery link",
    "asset.raw_archive": (m) => `RAW vault: ${m.n ?? "?"} file${Number(m.n) === 1 ? "" : "s"} moved to cold storage (restorable)`,
    "asset.raw_restore": (m) =>
      `RAW vault: ${[m.restored ? `${m.restored} restored` : null, m.extended ? `${m.extended} kept hot` : null].filter(Boolean).join(", ") || "renewed"}`,
    "asset.raw_purge": (m) => `RAW vault: ${m.n ?? "?"} file${Number(m.n) === 1 ? "" : "s"} permanently deleted after final warnings`,
    "project.event_date_set": (m) => `set the event date to ${m.eventDate ?? ""}`.trim(),
    "project.notes_set": () => "updated the project notes",
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
  );
}
