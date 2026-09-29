"use client";

/* WEB-266: per-grant lifecycle controls in the share panel — schedule /
 * open+notify, guests list with export, "new photos added" send. */

import { useEffect, useState } from "react";

import { Button } from "@webcules/ui/components/button";

type Guest = { email: string; kind: string; createdAt: string; notifiedAt: number | null };

export function GrantLifecycle({ grantId, canSchedule }: { grantId: string; canSchedule: boolean }) {
  const [open, setOpen] = useState(false);
  const [openAt, setOpenAt] = useState<string | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");

  async function load() {
    const res = await fetch(`/api/grants/${grantId}/lifecycle`);
    if (!res.ok) return;
    const body = (await res.json()) as { guests: Guest[]; openAt: string | null };
    setGuests(body.guests);
    setOpenAt(body.openAt);
    if (body.openAt) setScheduleDate(body.openAt.slice(0, 10));
  }

  useEffect(() => {
    if (open) void load();
  }, [open, grantId]);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setNote("");
    try {
      const res = await fetch(`/api/grants/${grantId}/lifecycle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; notified?: number; openAt?: string | null; error?: string };
      if (!res.ok || json.ok === false) {
        setNote(json.error === "scheduling_requires_lite" ? "Scheduling is a Lite feature." : "Couldn't do that — try again.");
      } else if (body.action === "open") {
        setNote(`Opened ✓ — ${json.notified ?? 0} registered guest${json.notified === 1 ? "" : "s"} emailed`);
        await load();
      } else if (body.action === "schedule") {
        setNote(json.openAt ? `Scheduled for ${new Date(json.openAt).toLocaleDateString()}` : "Schedule cleared — gallery is open");
        await load();
      } else {
        setNote("Notification sent ✓");
        await load();
      }
    } catch {
      setNote("Network error — try again.");
    }
    setBusy(false);
    setTimeout(() => setNote(""), 4000);
  }

  const scheduled = Boolean(openAt);
  const prereg = guests.filter((g) => g.kind === "preregistered");

  return (
    <div className="border-t border-hairline px-4 py-2">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs font-medium text-ink-subtle hover:text-ink">
        {open ? "▾" : "▸"} Guests &amp; schedule
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-3 pb-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {canSchedule ? (
              <>
                <input
                  type="date"
                  value={scheduleDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="rounded-md border border-hairline bg-canvas px-2 py-1 text-sm text-ink"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !scheduleDate}
                  onClick={() => void act({ action: "schedule", openAt: new Date(`${scheduleDate}T09:00:00`).toISOString() })}
                >
                  {scheduled ? "Reschedule" : "Schedule opening"}
                </Button>
                {scheduled && (
                  <Button size="sm" disabled={busy} onClick={() => void act({ action: "open" })} title="Open now and email every pre-registered guest">
                    Open + notify {prereg.length > 0 ? `(${prereg.length})` : ""}
                  </Button>
                )}
                {scheduled && (
                  <button type="button" disabled={busy} onClick={() => void act({ action: "schedule", openAt: null })} className="text-xs text-ink-tertiary underline underline-offset-2">
                    clear schedule
                  </button>
                )}
              </>
            ) : (
              <p className="text-xs text-ink-tertiary">Scheduling + pre-registration are Lite features.</p>
            )}
          </div>

          {guests.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
                Guests ({guests.length}) · pre-registered {prereg.length}
              </p>
              <ul className="mt-1 max-h-28 space-y-0.5 overflow-y-auto">
                {guests.slice(0, 20).map((g) => (
                  <li key={g.email} className="text-xs text-ink-subtle">
                    {g.email} <span className="text-ink-tertiary">· {g.kind === "preregistered" ? (g.notifiedAt ? "notified" : "waiting") : "gate capture"}</span>
                  </li>
                ))}
              </ul>
              <a href={`/api/grants/${grantId}/lifecycle?format=csv`} className="mt-1 inline-block text-xs text-primary underline underline-offset-2">
                Export guests CSV
              </a>
            </div>
          ) : (
            <p className="text-xs text-ink-tertiary">No guests yet — captures appear here when visitors leave their email.</p>
          )}

          <Button size="sm" variant="outline" disabled={busy} onClick={() => void act({ action: "notify-updated", newCount: 5 })} title="Email the client that new photos were added">
            Notify new photos…
          </Button>
          {note && <p className="text-xs text-ink-subtle">{note}</p>}
        </div>
      )}
    </div>
  );
}
