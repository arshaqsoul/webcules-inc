import Link from "next/link";
import { redirect } from "next/navigation";

import { CalendarMonth } from "@/components/calendar-month";
import { AvailabilityEditor } from "@/components/availability-editor";
import { getAvailability } from "@/lib/repos/availability";
import { listBookingsInRange } from "@/lib/repos/bookings";
import { listProjectsInRange } from "@/lib/repos/projects";
import { listLeadsInRange } from "@/lib/repos/leads";
import { manageLinkState } from "@/lib/repos/booking-manage";
import { getStudioProfile } from "@/lib/repos/studios";
import { getOrgContext } from "@/lib/session";

export const metadata = { title: "Calendar" };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; month?: string }>;
}) {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  const { tab = "calendar", month } = await searchParams;

  const activeMonth = month && /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);
  // First → LAST day of the month (Date.UTC day 0 of next month) — correct
  // for 28/29/30-day months; the "-31" hack rolled over into the next month.
  const [my, mm] = activeMonth.split("-").map(Number);
  const rangeStart = new Date(Date.UTC(my, mm - 1, 1, 0, 0, 0));
  const rangeEnd = new Date(Date.UTC(my, mm, 0, 23, 59, 59));

  const tabs = [
    { key: "calendar", label: "Calendar" },
    { key: "availability", label: "Availability" },
  ];
  // Profile, the month's bookings and the month's committed projects /
  // dated leads are independent — fetch in parallel.
  const [profile, bookings, projects, leads] = await Promise.all([
    getStudioProfile(ctx.organizationId),
    tab === "availability" ? Promise.resolve([]) : listBookingsInRange(ctx.organizationId, rangeStart, rangeEnd),
    tab === "availability" ? Promise.resolve([]) : listProjectsInRange(ctx.organizationId, rangeStart, rangeEnd),
    tab === "availability" ? Promise.resolve([]) : listLeadsInRange(ctx.organizationId, rangeStart, rangeEnd),
  ]);
  const tz = profile?.timezone ?? "UTC";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.6px] text-ink">Calendar</h1>
          <p className="mt-1 text-sm text-ink-subtle">
            Booked sessions · times shown in {tz}
          </p>
        </div>
        <div className="flex gap-1.5">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/dashboard/calendar?tab=${t.key}`}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                tab === t.key ? "bg-surface-2 text-ink" : "text-ink-subtle hover:bg-surface-1 hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      {tab === "availability" ? (
        <div className="flex flex-col gap-5">
          {/* WEB-286: session type definitions moved to Templates; Calendar
           * keeps availability + a pointer so the old muscle memory lands. */}
          <Link
            href="/dashboard/templates/session-types"
            className="flex items-center justify-between rounded-[12px] border border-hairline bg-surface-1 p-5 text-sm transition-colors hover:border-primary/40"
          >
            <span className="text-ink">
              <strong className="font-medium">Session types live under Templates now.</strong>{" "}
              <span className="text-ink-subtle">Duration, price, deposit and booking form — Calendar keeps your availability below.</span>
            </span>
            <span className="shrink-0 font-medium text-primary">Manage →</span>
          </Link>
          <AvailabilityEditor initial={await getAvailability(ctx.organizationId)} currency={profile?.paymentCurrency ?? "usd"} payoutsReady={profile?.stripeConnectState === "active"} />
        </div>
      ) : (
        <CalendarMonth
          organizationId={ctx.organizationId}
          tz={tz}
          initialMonth={activeMonth}
          initialBookings={bookings.map((b) => ({
            id: b.id,
            startAt: b.startAt.toISOString(),
            clientName: b.clientName ?? b.clientEmail,
            status: b.status,
            paymentStatus: b.paymentStatus,
            rescheduledAt: b.rescheduledAt ? b.rescheduledAt.toISOString() : null,
            previousStartAt: b.previousStartAt ? b.previousStartAt.toISOString() : null,
            manageLink: manageLinkState(b),
          }))}
          initialProjects={projects.map((p) => ({ id: p.id, title: p.title, status: p.status, eventDate: p.eventDate ? p.eventDate.toISOString() : null }))}
          initialLeads={leads.map((l) => ({ id: l.id, name: l.name, status: l.status, eventDate: l.eventDate ? l.eventDate.toISOString() : null }))}
        />
      )}
    </div>
  );
}
