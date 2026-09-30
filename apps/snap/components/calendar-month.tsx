"use client";

/* Dashboard calendar — month grid with day drill-down + cancel.
 * The server seeds the first paint; the component then owns its data: it
 * refetches the month on navigation, whenever the tab regains focus
 * (bookings made elsewhere — e.g. the widget in another tab — appear
 * without a manual refresh), and after actions, so the view can never drift
 * from the server for longer than one fetch.
 * WEB-286: the month shows EVERYTHING the studio holds — widget bookings,
 * committed projects (booked/snapping — converted leads land here) and
 * dated open leads (tentative, dashed pill).
 * WEB-272: the day panel also shows payment state + reschedule bookkeeping,
 * lets the studio reschedule a client (same slot engine as the manage page)
 * and control the client's manage-booking link. */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { Button } from "@webcules/ui/components/button";
import { Input } from "@webcules/ui/components/input";
import { useConfirm } from "@/components/confirm-provider";

type BookingItem = {
  id: string;
  startAt: string;
  clientName: string;
  status: string;
  paymentStatus: string;
  rescheduledAt: string | null;
  previousStartAt: string | null;
  manageLink: "none" | "active" | "revoked";
};

type ProjectItem = { id: string; title: string; status: string; eventDate: string | null };
type LeadItem = { id: string; name: string; status: string; eventDate: string | null };

/** Unified day-cell entry — kind drives the pill style and the panel row. */
type DayEntry = {
  kind: "booking" | "project" | "lead";
  id: string;
  day: string;
  at: string;
  label: string;
  booking?: BookingItem;
  project?: ProjectItem;
  lead?: LeadItem;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const PAYMENT_LABEL: Record<string, string> = {
  unpaid: "unpaid",
  deposit_paid: "deposit",
  paid: "paid",
};

function dayKeyInTz(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export function CalendarMonth({
  tz,
  initialMonth,
  initialBookings,
  initialProjects = [],
  initialLeads = [],
}: {
  organizationId: string;
  tz: string;
  initialMonth: string;
  initialBookings: BookingItem[];
  initialProjects?: ProjectItem[];
  initialLeads?: LeadItem[];
}) {
  const confirm = useConfirm();
  const [month, setMonth] = useState(initialMonth);
  const [bookings, setBookings] = useState(initialBookings);
  const [projects, setProjects] = useState(initialProjects);
  const [leads, setLeads] = useState(initialLeads);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const loadToken = useRef(0);

  /** Fetch a month's calendar; the token drops stale responses (fast nav). */
  const load = useCallback(async (m: string) => {
    const token = ++loadToken.current;
    try {
      const res = await fetch(`/api/bookings?month=${m}`, { cache: "no-store" });
      if (!res.ok) return; // keep current view; surfaced by the action paths
      const body = (await res.json()) as { bookings?: BookingItem[]; projects?: ProjectItem[]; leads?: LeadItem[] };
      if (token === loadToken.current) {
        if (Array.isArray(body.bookings)) setBookings(body.bookings);
        if (Array.isArray(body.projects)) setProjects(body.projects);
        if (Array.isArray(body.leads)) setLeads(body.leads);
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

  // Unified day map: bookings (time pips), projects (committed), leads (tentative).
  const byDay = new Map<string, DayEntry[]>();
  const push = (e: DayEntry) => byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);
  for (const b of bookings) push({ kind: "booking", id: b.id, day: dayKeyInTz(b.startAt, tz), at: b.startAt, label: b.clientName, booking: b });
  for (const p of projects) if (p.eventDate) push({ kind: "project", id: p.id, day: dayKeyInTz(p.eventDate, tz), at: p.eventDate, label: p.title, project: p });
  for (const l of leads) if (l.eventDate) push({ kind: "lead", id: l.id, day: dayKeyInTz(l.eventDate, tz), at: l.eventDate, label: l.name, lead: l });

  const monthLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long", year: "numeric", timeZone: "UTC",
  });

  const dayEntries = selectedDay ? (byDay.get(selectedDay) ?? []) : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
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
            const active = dayItems.filter((e) => e.kind !== "booking" || (e.booking && e.booking.status !== "canceled"));
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
                {active.slice(0, 2).map((e) => (
                  <span
                    key={`${e.kind}-${e.id}`}
                    className={`w-full truncate px-1 py-0.5 text-[10px] ${
                      e.kind === "booking"
                        ? "rounded bg-primary/15 text-primary"
                        : e.kind === "project"
                          ? "rounded bg-success/10 text-success"
                          : "rounded border border-dashed border-hairline text-ink-tertiary"
                    }`}
                  >
                    {e.kind === "booking" && new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(e.at))}
                    {e.kind === "booking" ? " " : e.kind === "project" ? "📷 " : "✉ "}
                    {e.label}
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
          {dayEntries.length === 0 && (
            <p className="text-sm text-ink-subtle">Nothing this day.</p>
          )}
          {dayEntries.map((e) =>
            e.kind === "booking" && e.booking ? (
              <BookingCard key={`b-${e.booking.id}`} booking={e.booking} tz={tz} busy={busy === e.booking.id} onCanceled={(id) => { setBookings((prev) => prev.filter((x) => x.id !== id)); void load(month); }} onCancel={cancel} />
            ) : e.kind === "project" && e.project ? (
              <Link
                key={`p-${e.project.id}`}
                href={`/dashboard/projects/${e.project.id}`}
                className="rounded-md border border-hairline bg-background p-3 transition-colors hover:border-success/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-success">{e.project.status === "snapping" ? "Snapping" : "Booked"} — shoot day</span>
                  <span className="text-[11px] text-ink-tertiary">project →</span>
                </div>
                <p className="mt-1 text-sm text-ink-muted">{e.project.title}</p>
                <p className="mt-0.5 text-[11px] text-ink-tertiary">Converted from a lead or booked manually — manage it on the project page.</p>
              </Link>
            ) : e.lead ? (
              <Link
                key={`l-${e.lead.id}`}
                href="/dashboard/leads"
                className="rounded-md border border-dashed border-hairline bg-background p-3 transition-colors hover:border-primary/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink-subtle">Tentative — lead</span>
                  <span className="text-[11px] text-ink-tertiary">lead →</span>
                </div>
                <p className="mt-1 text-sm text-ink-muted">{e.lead.name}</p>
                <p className="mt-0.5 text-[11px] text-ink-tertiary">Not booked yet — reply and convert to hold the date.</p>
              </Link>
            ) : null,
          )}
        </div>
        {notice && <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">{notice}</p>}
      </div>
    </div>
  );
}

function fmtTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function fmtDayTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** WEB-272: day-panel booking card — cancel (existing), studio reschedule
 * (engine-validated slot chips), and the client manage-link controls. */
function BookingCard({
  booking,
  tz,
  busy,
  onCancel,
  onCanceled,
}: {
  booking: BookingItem;
  tz: string;
  busy: boolean;
  onCancel: (id: string) => void;
  onCanceled: (id: string) => void;
}) {
  const confirm = useConfirm();
  const [rescheduling, setRescheduling] = useState(false);
  const [pickDate, setPickDate] = useState(booking.startAt.slice(0, 10));
  const [slots, setSlots] = useState<{ startAt: string }[]>([]);
  const [slotsBusy, setSlotsBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const canceled = booking.status === "canceled";

  async function loadSlots(date: string) {
    setSlotsBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/bookings/${booking.id}/slots?date=${date}`, { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as { slots?: { startAt: string }[] };
      setSlots(res.ok ? body.slots ?? [] : []);
      if (res.ok && !(body.slots?.length)) setMsg("No open slots that day.");
    } catch {
      setSlots([]);
      setMsg("Couldn't load slots — try again.");
    }
    setSlotsBusy(false);
  }

  async function reschedule(slotStart: string) {
    setMsg("Moving…");
    try {
      const res = await fetch(`/api/bookings/${booking.id}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotStart }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setRescheduling(false);
        setLinkUrl(null);
        onCanceled(booking.id); // reload via parent (also collapses stale cards)
        return;
      }
      setMsg(
        body.error === "slot_unavailable"
          ? "That slot is no longer open — pick another."
          : body.error === "conflict"
            ? "Someone just took that slot — pick another."
            : body.error === "canceled"
              ? "This booking was canceled."
              : "Couldn't move the booking — try again.",
      );
      void loadSlots(pickDate);
    } catch {
      setMsg("Network error — try again.");
    }
  }

  async function manageLink(action: "revoke" | "reissue") {
    if (action === "revoke") {
      if (!(await confirm({ title: "Turn off the manage link?", body: "The client's Manage booking page stops working immediately.", destructive: true }))) return;
    }
    setMsg("");
    try {
      const res = await fetch(`/api/bookings/${booking.id}/manage-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; manageLink?: string; error?: string };
      if (!res.ok) {
        setMsg("Couldn't update the link — try again.");
        return;
      }
      if (action === "reissue" && body.url) {
        setLinkUrl(body.url);
        try {
          await navigator.clipboard.writeText(body.url);
          setMsg("Fresh manage link copied to clipboard.");
        } catch {
          setMsg("Fresh manage link below — copy it to the client.");
        }
      } else {
        setLinkUrl(null);
        setMsg("Manage link turned off.");
      }
    } catch {
      setMsg("Network error — try again.");
    }
  }

  return (
    <div className="rounded-md border border-hairline bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink">{fmtTime(booking.startAt, tz)}</span>
        {!canceled && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" disabled={rescheduling} onClick={() => { setRescheduling((v) => !v); if (!rescheduling) { setPickDate(booking.startAt.slice(0, 10)); void loadSlots(booking.startAt.slice(0, 10)); } }}>
              {rescheduling ? "Close" : "Reschedule"}
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => onCancel(booking.id)}>
              {busy ? "Canceling…" : "Cancel"}
            </Button>
          </div>
        )}
      </div>
      <p className="mt-1 text-sm text-ink-muted">{booking.clientName}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[11px] ${canceled ? "bg-surface-2 text-ink-tertiary line-through" : booking.paymentStatus !== "unpaid" ? "bg-success/10 text-success" : "bg-surface-2 text-ink-tertiary"}`}>
          {canceled ? "canceled" : (PAYMENT_LABEL[booking.paymentStatus] ?? booking.paymentStatus)}
        </span>
        {booking.previousStartAt && !canceled && (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-tertiary">
            moved from {fmtDayTime(booking.previousStartAt, tz)}
          </span>
        )}
      </div>

      {rescheduling && !canceled && (
        <div className="mt-3 rounded-md border border-hairline bg-surface-1 p-3">
          <p className="text-xs font-medium text-ink">Pick a new slot ({tz})</p>
          <div className="mt-2 flex items-center gap-2">
            <Input
              type="date"
              value={pickDate}
              onChange={(e) => { setPickDate(e.target.value); if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) void loadSlots(e.target.value); }}
              className="w-40"
            />
            {slotsBusy && <span className="text-xs text-ink-tertiary">Loading…</span>}
          </div>
          {slots.length > 0 && (
            <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {slots.map((s) => (
                <button
                  key={s.startAt}
                  onClick={() => void reschedule(s.startAt)}
                  className="rounded-md border border-hairline px-2.5 py-1 text-xs text-ink hover:border-primary hover:text-primary"
                >
                  {fmtTime(s.startAt, tz)}
                </button>
              ))}
            </div>
          )}
          {msg && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{msg}</p>}
        </div>
      )}

      {!canceled && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-hairline pt-2">
          <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
            Client manage link: {booking.manageLink === "active" ? "on" : booking.manageLink === "revoked" ? "off" : "never issued"}
          </span>
          {booking.manageLink === "active" ? (
            <button onClick={() => void manageLink("revoke")} className="text-[11px] font-medium text-ink-subtle hover:text-destructive">
              Turn off
            </button>
          ) : (
            <button onClick={() => void manageLink("reissue")} className="text-[11px] font-medium text-primary hover:underline">
              {booking.manageLink === "revoked" ? "Reissue" : "Issue link"}
            </button>
          )}
        </div>
      )}
      {linkUrl && (
        <input readOnly value={linkUrl} onFocus={(e) => e.target.select()} className="mt-2 w-full rounded-md border border-hairline bg-surface-1 px-2 py-1 text-[11px] text-ink-subtle" />
      )}
      {msg && !rescheduling && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{msg}</p>}
    </div>
  );
}
