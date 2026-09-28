import Link from "next/link";
import { redirect } from "next/navigation";

import { CalendarMonth } from "@/components/calendar-month";
import { AvailabilityEditor } from "@/components/availability-editor";
import { getAvailability } from "@/lib/repos/availability";
import { listBookingsInRange } from "@/lib/repos/bookings";
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
  // Profile and the month's bookings are independent — fetch in parallel.
  const [profile, bookings] = await Promise.all([
    getStudioProfile(ctx.organizationId),
    tab === "availability"
      ? Promise.resolve([])
      : listBookingsInRange(ctx.organizationId, rangeStart, rangeEnd),
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
        <AvailabilityEditor initial={await getAvailability(ctx.organizationId)} />
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
          }))}
        />
      )}
    </div>
  );
}
