"use client";

/* Dashboard calendar — month grid of bookings with day drill-down + cancel.
 * The server seeds the first paint (initialBookings); the component then owns
 * its data: it refetches the month on navigation, whenever the tab regains
 * focus (bookings made elsewhere — e.g. the widget in another tab — appear
 * without a manual refresh), and after actions, so the view can never drift
 * from the server for longer than one fetch. */
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@webcules/ui/components/button";
import { useConfirm } from "@/components/confirm-provider";

type BookingItem = {
  id: string;
  startAt: string;
  clientName: string;
  status: string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarMonth({
  tz,
  initialMonth,
  initialBookings,
}: {
  organizationId: string;
  tz: string;
  initialMonth: string;
  initialBookings: BookingItem[];
}) {
  const confirm = useConfirm();
  const [month, setMonth] = useState(initialMonth);
  const [bookings, setBookings] = useState(initialBookings);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const loadToken = useRef(0);

  /** Fetch a month's bookings; the token drops stale responses (fast nav). */
  const load = useCallback(async (m: string) => {
    const token = ++loadToken.current;
    try {
      const res = await fetch(`/api/bookings?month=${m}`, { cache: "no-store" });
      if (!res.ok) return; // keep current view; surfaced by the action paths
      const body = (await res.json()) as { bookings?: BookingItem[] };
      if (token === loadToken.current && Array.isArray(body.bookings)) {
        setBookings(body.bookings);
      }
    } catch {
      /* offline blip — the focus listener will retry */
    }
  }, []);

  // Month navigation: client-side state + shareable URL, data always fresh.
  function goMonth(delta: 1 | -1) {
    const [y, m] = month.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
    setMonth(next);
    setSelectedDay(null);
    window.history.replaceState(null, "", `/dashboard/calendar?month=${next}`);
    void load(next);
  }

  // Fresh data when the tab comes back (booked in another tab / widget).
  useEffect(() => {
    const onFocus = () => void load(month);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load, month]);

  async function cancel(id: string) {
    if (!(await confirm({ title: "Cancel booking?", body: "The client is emailed and the slot frees up.", destructive: true }))) return;
    setBusy(id);
    setNotice("");
    let ok = false;
    try {
      const res = await fetch(`/api/bookings/${id}`, { method: "POST" });
      ok = res.ok;
    } catch {
      /* network — fall through to refetch */
    }
    setBusy(null);
    if (ok) {
      setBookings((prev) => prev.filter((b) => b.id !== id));
    } else {
      // Non-2xx does NOT mean the cancel failed — the server cancels before
      // the email step, and an email error would 500 after committing.
      setNotice("Couldn't confirm the cancellation — refreshing your calendar…");
    }
    // Either way, sync with server truth.
    await load(month);
  }

  const [y, m] = month.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

  const byDay = new Map<string, BookingItem[]>();
  for (const b of bookings) {
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(b.startAt));
    byDay.set(day, [...(byDay.get(day) ?? []), b]);
  }

  const monthLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long", year: "numeric", timeZone: "UTC",
  });

  const dayBookings = selectedDay ? (byDay.get(selectedDay) ?? []) : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="rounded-[12px] border border-hairline bg-surface-1 p-4">
        <div className="mb-3 flex items-center justify-between">
          <button onClick={() => goMonth(-1)} className="rounded-md px-2 py-1 text-sm text-ink-subtle hover:bg-surface-2 hover:text-ink" aria-label="Previous month">
            ←
          </button>
          <span className="text-sm font-medium text-ink">{monthLabel}</span>
          <button onClick={() => goMonth(1)} className="rounded-md px-2 py-1 text-sm text-ink-subtle hover:bg-surface-2 hover:text-ink" aria-label="Next month">
            →
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] uppercase tracking-wide text-ink-tertiary">
          {WEEKDAYS.map((d) => <div key={d} className="py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstWeekday }).map((_, i) => <div key={`pad-${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const date = `${month}-${String(i + 1).padStart(2, "0")}`;
            const dayItems = byDay.get(date) ?? [];
            const active = dayItems.filter((b) => b.status !== "canceled");
            const canceled = dayItems.length - active.length;
            return (
              <button
                key={date}
                onClick={() => setSelectedDay(date)}
                className={`flex min-h-[64px] flex-col items-start gap-0.5 rounded-md border p-1.5 text-left transition-colors ${
                  selectedDay === date
                    ? "border-primary/50 bg-primary/10"
                    : dayItems.length
                      ? "border-hairline bg-background hover:bg-surface-2"
                      : "border-transparent hover:bg-surface-2"
                }`}
              >
                <span className="text-xs font-medium text-ink">{i + 1}</span>
                {active.slice(0, 2).map((b) => (
                  <span key={b.id} className="w-full truncate rounded bg-primary/15 px-1 py-0.5 text-[10px] text-primary">
                    {new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(b.startAt))}
                  </span>
                ))}
                {active.length > 2 && <span className="text-[10px] text-ink-tertiary">+{active.length - 2} more</span>}
                {canceled > 0 && (
                  <span className="w-full truncate rounded bg-surface-2 px-1 py-0.5 text-[10px] text-ink-tertiary line-through">
                    {canceled} canceled
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-[12px] border border-hairline bg-surface-1 p-4">
        <h2 className="text-[15px] font-medium text-ink">
          {selectedDay ? new Date(`${selectedDay}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }) : "Select a day"}
        </h2>
        <div className="mt-3 flex flex-col gap-2">
          {dayBookings.length === 0 && (
            <p className="text-sm text-ink-subtle">No bookings this day.</p>
          )}
          {dayBookings.map((b) => (
            <div key={b.id} className="rounded-md border border-hairline bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink">
                  {new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(b.startAt))}
                </span>
                {b.status !== "canceled" && (
                  <Button size="sm" variant="ghost" className="text-destructive" disabled={busy === b.id} onClick={() => cancel(b.id)}>
                    {busy === b.id ? "Canceling…" : "Cancel"}
                  </Button>
                )}
              </div>
              <p className="mt-1 text-sm text-ink-muted">{b.clientName}</p>
              {b.status === "canceled" && <span className="text-xs text-ink-tertiary">canceled</span>}
            </div>
          ))}
        </div>
        {notice && <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">{notice}</p>}
      </div>
    </div>
  );
}
