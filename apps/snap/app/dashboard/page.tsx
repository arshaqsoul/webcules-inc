/* Dashboard overview — live studio stats (counts are cheap indexed scans;
 * the two lists stream in via Suspense so the cards paint first). The page
 * shell itself also streams behind OverviewSkeleton — as an in-page
 * Suspense, not a route loading.tsx, because route-level boundaries in a
 * parent segment re-show on every searchParams change below them (tab and
 * filter navigation), which reads as a skeleton flash. */
import { and, desc, eq, gte, inArray, isNull, ne, notInArray, or, gt, sql } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getStudioProfile } from "@/lib/repos/studios";
import { getOrgContext } from "@/lib/session";

export const metadata = { title: "Overview" };

const STATUS_ACCENT: Record<string, string> = {
  booked: "#5e6ad2",
  snapping: "#e5912d",
  evaluation: "#8f5fee",
  complete: "#1e8e3e",
  closed: "#8a8f98",
  canceled: "#c0271f",
};

async function n(query: Promise<{ n: number | null }[]>): Promise<number> {
  return Number((await query)[0]?.n ?? 0);
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <Overview />
    </Suspense>
  );
}

async function Overview() {
  const ctx = (await getOrgContext())!;
  const db = getDb();

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const now = new Date();

  const [profile, leadTotal, leadNew, upcomingBookings, projectTotal, projectActive, galleries, projectsByStatus] =
    await Promise.all([
      getStudioProfile(ctx.organizationId),
      n(db.select({ n: sql<number>`count(*)` }).from(schema.leads).where(eq(schema.leads.organizationId, ctx.organizationId))),
      n(
        db
          .select({ n: sql<number>`count(*)` })
          .from(schema.leads)
          .where(and(eq(schema.leads.organizationId, ctx.organizationId), gte(schema.leads.createdAt, monthStart))),
      ),
      n(
        db
          .select({ n: sql<number>`count(*)` })
          .from(schema.bookings)
          .where(
            and(
              eq(schema.bookings.organizationId, ctx.organizationId),
              inArray(schema.bookings.status, ["pending", "confirmed"]),
              gte(schema.bookings.startAt, now),
            ),
          ),
      ),
      n(db.select({ n: sql<number>`count(*)` }).from(schema.projects).where(eq(schema.projects.organizationId, ctx.organizationId))),
      n(
        db
          .select({ n: sql<number>`count(*)` })
          .from(schema.projects)
          .where(
            and(
              eq(schema.projects.organizationId, ctx.organizationId),
              notInArray(schema.projects.status, ["closed", "canceled"]),
            ),
          ),
      ),
      n(
        db
          .select({ n: sql<number>`count(*)` })
          .from(schema.shareGrants)
          .where(
            and(
              eq(schema.shareGrants.organizationId, ctx.organizationId),
              eq(schema.shareGrants.status, "active"),
              or(isNull(schema.shareGrants.expiresAt), gt(schema.shareGrants.expiresAt, now)),
            ),
          ),
      ),
      db
        .select({ status: schema.projects.status, n: sql<number>`count(*)` })
        .from(schema.projects)
        .where(eq(schema.projects.organizationId, ctx.organizationId))
        .groupBy(schema.projects.status),
    ]);

  const cards = [
    { label: "Leads", value: leadTotal, hint: `${leadNew} new this month`, href: "/dashboard/leads" },
    { label: "Upcoming sessions", value: upcomingBookings, hint: "pending + confirmed, from today", href: "/dashboard/calendar" },
    { label: "Active projects", value: projectActive, hint: `${projectTotal} total`, href: "/dashboard/projects" },
    { label: "Live galleries", value: galleries, hint: "active client links", href: "/dashboard/galleries" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.6px] text-ink">
          Welcome, {ctx.user.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-ink-subtle">
          {profile?.studioName} · timezone {profile?.timezone}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded-[12px] border border-hairline bg-surface-1 p-5 transition-colors hover:bg-surface-2"
          >
            <p className="text-xs text-ink-subtle">{c.label}</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{c.value}</p>
            <p className="mt-2 text-xs text-ink-tertiary">{c.hint}</p>
          </Link>
        ))}
      </div>

      {projectTotal > 0 && (
        <div className="rounded-[12px] border border-hairline bg-surface-1 p-5">
          <p className="text-sm font-medium text-ink">Pipeline</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {projectsByStatus
              .slice()
              .sort((a, b) => Number(b.n) - Number(a.n))
              .map((s) => (
                <Link
                  key={s.status}
                  href="/dashboard/projects"
                  className="flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1 text-xs text-ink-subtle transition-colors hover:text-ink"
                >
                  <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: STATUS_ACCENT[s.status] ?? "#8a8f98" }} />
                  {s.status} · {Number(s.n)}
                </Link>
              ))}
          </div>
        </div>
      )}

      <Suspense fallback={<ListsSkeleton />}>
        <OverviewLists organizationId={ctx.organizationId} tz={profile?.timezone ?? "UTC"} now={now.toISOString()} />
      </Suspense>
    </div>
  );
}

async function OverviewLists({ organizationId, tz, now }: { organizationId: string; tz: string; now: string }) {
  const db = getDb();
  const [nextBookings, latestLeads] = await Promise.all([
    db
      .select({
        id: schema.bookings.id,
        startAt: schema.bookings.startAt,
        clientName: schema.bookings.clientName,
        clientEmail: schema.bookings.clientEmail,
        status: schema.bookings.status,
      })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.organizationId, organizationId),
          ne(schema.bookings.status, "canceled"),
          gte(schema.bookings.startAt, new Date(now)),
        ),
      )
      .orderBy(schema.bookings.startAt)
      .limit(5),
    db
      .select({
        id: schema.leads.id,
        name: schema.leads.name,
        email: schema.leads.email,
        status: schema.leads.status,
        createdAt: schema.leads.createdAt,
      })
      .from(schema.leads)
      .where(eq(schema.leads.organizationId, organizationId))
      .orderBy(desc(schema.leads.createdAt))
      .limit(5),
  ]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-ink">Next sessions</p>
          <Link href="/dashboard/calendar" className="text-xs text-ink-subtle hover:text-ink">
            Calendar →
          </Link>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {nextBookings.length === 0 && <p className="text-sm text-ink-subtle">Nothing booked ahead.</p>}
          {nextBookings.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-2 rounded-md border border-hairline bg-background p-3">
              <div>
                <p className="text-sm text-ink">{b.clientName ?? b.clientEmail}</p>
                <p className="text-xs text-ink-tertiary">
                  {new Intl.DateTimeFormat("en-US", {
                    timeZone: tz,
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(b.startAt)}
                </p>
              </div>
              <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">{b.status}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-ink">Latest leads</p>
          <Link href="/dashboard/leads" className="text-xs text-ink-subtle hover:text-ink">
            Inbox →
          </Link>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {latestLeads.length === 0 && <p className="text-sm text-ink-subtle">No leads yet — embed the contact form.</p>}
          {latestLeads.map((l) => (
            <Link
              key={l.id}
              href={`/dashboard/leads/${l.id}`}
              className="flex items-center justify-between gap-2 rounded-md border border-hairline bg-background p-3 transition-colors hover:bg-surface-2"
            >
              <div>
                <p className="text-sm text-ink">{l.name}</p>
                <p className="text-xs text-ink-tertiary">{l.email}</p>
              </div>
              <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">{l.status}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function ListsSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-[12px] border border-hairline bg-surface-1 p-5">
          <div className="h-4 w-28 animate-pulse rounded bg-surface-2" />
          <div className="mt-4 flex flex-col gap-2">
            {[0, 1, 2].map((j) => (
              <div key={j} className="h-14 animate-pulse rounded-md bg-surface-2" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-56 animate-pulse rounded-md bg-surface-2" />
        <div className="h-4 w-72 animate-pulse rounded bg-surface-2" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-[12px] border border-hairline bg-surface-1 p-5">
            <div className="h-3 w-20 animate-pulse rounded bg-surface-2" />
            <div className="mt-3 h-7 w-12 animate-pulse rounded-md bg-surface-2" />
            <div className="mt-3 h-3 w-28 animate-pulse rounded bg-surface-2" />
          </div>
        ))}
      </div>
      <div className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <div className="h-4 w-16 animate-pulse rounded bg-surface-2" />
        <div className="mt-3 flex flex-wrap gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-6 w-24 animate-pulse rounded-full bg-surface-2" />
          ))}
        </div>
      </div>
      <ListsSkeleton />
    </div>
  );
}
