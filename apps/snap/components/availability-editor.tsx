"use client";

/* Weekly availability editor — per-weekday time windows + booking settings +
 * blackout dates. Replace-all save. Minutes-from-midnight under the hood. */
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@webcules/ui/components/button";
import { Input } from "@webcules/ui/components/input";
import { Label } from "@webcules/ui/components/label";

type Rule = {
  weekday: number;
  startMinute: number;
  endMinute: number;
  slotMinutes?: number;
  bufferMinutes?: number;
  active?: boolean;
};

type Initial = {
  rules: Rule[];
  blackouts: string[];
  settings: {
    slotMinutes: number;
    bufferMinutes: number;
    leadTimeMinutes: number;
    maxAdvanceDays: number;
  };
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const fromHHMM = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function AvailabilityEditor({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [rules, setRules] = useState<Rule[]>(initial.rules);
  const [settings, setSettings] = useState(initial.settings);
  const [blackouts, setBlackouts] = useState<string[]>(initial.blackouts);
  const [newBlackout, setNewBlackout] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dayRules = (weekday: number) => rules.filter((r) => r.weekday === weekday);

  function addWindow(weekday: number) {
    setRules((prev) => [
      ...prev,
      { weekday, startMinute: 9 * 60, endMinute: 17 * 60 },
    ]);
  }

  function updateRule(idx: number, patch: Partial<Rule>) {
    setRules((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function save() {
    setBusy(true);
    setStatus(null);
    const res = await fetch("/api/studio/availability", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules, settings, blackouts }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    setStatus(res.ok ? "Availability saved." : `Save failed: ${body.error ?? "unknown"}`);
    if (res.ok) router.refresh();
  }

  const card = "rounded-[12px] border border-hairline bg-surface-1 p-5";

  return (
    <div className="flex flex-col gap-4">
      <section className={card}>
        <h2 className="text-[15px] font-medium text-ink">Weekly hours</h2>
        <p className="mt-1 text-xs text-ink-subtle">Times are in your studio timezone. Multiple windows per day are fine.</p>
        <div className="mt-4 flex flex-col divide-y divide-hairline">
          {DAYS.map((day, weekday) => (
            <div key={day} className="flex flex-wrap items-center gap-2 py-2.5">
              <span className="w-24 text-sm font-medium text-ink">{day}</span>
              <div className="flex flex-1 flex-wrap items-center gap-2">
                {dayRules(weekday).length === 0 && (
                  <span className="text-xs text-ink-tertiary">Unavailable</span>
                )}
                {rules.map((rule, idx) =>
                  rule.weekday !== weekday ? null : (
                    <span key={idx} className="flex items-center gap-1.5 rounded-md border border-hairline bg-background px-2 py-1">
                      <input
                        type="time"
                        value={toHHMM(rule.startMinute)}
                        onChange={(e) => updateRule(idx, { startMinute: fromHHMM(e.target.value) })}
                        className="bg-transparent text-xs text-ink outline-none"
                      />
                      <span className="text-xs text-ink-tertiary">–</span>
                      <input
                        type="time"
                        value={toHHMM(rule.endMinute)}
                        onChange={(e) => updateRule(idx, { endMinute: fromHHMM(e.target.value) })}
                        className="bg-transparent text-xs text-ink outline-none"
                      />
                      <button
                        aria-label="Remove window"
                        className="ml-1 text-xs text-ink-tertiary hover:text-destructive"
                        onClick={() => setRules((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        ✕
                      </button>
                    </span>
                  ),
                )}
                <button
                  onClick={() => addWindow(weekday)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:underline"
                >
                  + Add hours
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={card}>
        <h2 className="text-[15px] font-medium text-ink">Booking settings</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="slot">Slot length (min)</Label>
            <Input id="slot" type="number" min={15} max={480} step={15} value={settings.slotMinutes}
              onChange={(e) => setSettings({ ...settings, slotMinutes: Number(e.target.value) })} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="buffer">Buffer between (min)</Label>
            <Input id="buffer" type="number" min={0} max={240} step={5} value={settings.bufferMinutes}
              onChange={(e) => setSettings({ ...settings, bufferMinutes: Number(e.target.value) })} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="lead">Lead time (hours)</Label>
            <Input id="lead" type="number" min={0} max={720} value={Math.round(settings.leadTimeMinutes / 60)}
              onChange={(e) => setSettings({ ...settings, leadTimeMinutes: Number(e.target.value) * 60 })} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="advance">Bookable ahead (days)</Label>
            <Input id="advance" type="number" min={1} max={365} value={settings.maxAdvanceDays}
              onChange={(e) => setSettings({ ...settings, maxAdvanceDays: Number(e.target.value) })} />
          </div>
        </div>
      </section>

      <section className={card}>
        <h2 className="text-[15px] font-medium text-ink">Blackout dates</h2>
        <p className="mt-1 text-xs text-ink-subtle">Holidays, shoots you've blocked, days off.</p>
        <div className="mt-3 flex items-center gap-2">
          <Input type="date" value={newBlackout} onChange={(e) => setNewBlackout(e.target.value)} className="w-44" />
          <Button size="sm" variant="secondary"
            onClick={() => {
              if (/^\d{4}-\d{2}-\d{2}$/.test(newBlackout) && !blackouts.includes(newBlackout)) {
                setBlackouts((prev) => [...prev, newBlackout].sort());
                setNewBlackout("");
              }
            }}>
            Add
          </Button>
        </div>
        {blackouts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {blackouts.map((d) => (
              <button key={d} onClick={() => setBlackouts((prev) => prev.filter((x) => x !== d))}
                className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-ink-muted hover:text-destructive">
                {d} ✕
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save availability"}</Button>
        {status && <p className="text-sm text-ink-subtle">{status}</p>}
      </div>
    </div>
  );
}
