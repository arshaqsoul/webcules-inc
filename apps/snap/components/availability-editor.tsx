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
    /** Booking payment at checkout (deposit or full session). */
    payment?: {
      enabled: boolean;
      kind: "deposit" | "full";
      amountMinor: number;
      label?: string;
    };
    /** WEB-272: client self-serve change policy. */
    policy?: {
      rescheduleCutoffHours?: number;
      cancelCutoffHours?: number;
      refundPolicyText?: string;
    };
    /** WEB-273: reminder policy. */
    reminders?: {
      enabled: boolean;
      offsetsHours: number[];
      sendTo: "client" | "client+studio";
    };
  };
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const fromHHMM = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function AvailabilityEditor({
  initial,
  currency = "usd",
  payoutsReady = true,
}: {
  initial: Initial;
  currency?: string;
  /** WEB-352: the studio's Stripe account is connected and can take charges. */
  payoutsReady?: boolean;
}) {
  const router = useRouter();
  const [rules, setRules] = useState<Rule[]>(initial.rules);
  const [settings, setSettings] = useState(initial.settings);
  const [blackouts, setBlackouts] = useState<string[]>(initial.blackouts);
  const [newBlackout, setNewBlackout] = useState("");
  const [payEnabled, setPayEnabled] = useState(initial.settings.payment?.enabled ?? false);
  const [payKind, setPayKind] = useState<"deposit" | "full">(initial.settings.payment?.kind ?? "deposit");
  const [payAmount, setPayAmount] = useState(
    String(((initial.settings.payment?.amountMinor ?? 2500) / 100).toFixed(2)),
  );
  const [reschedCutoff, setReschedCutoff] = useState(String(initial.settings.policy?.rescheduleCutoffHours ?? 24));
  const [cancelCutoff, setCancelCutoff] = useState(String(initial.settings.policy?.cancelCutoffHours ?? 48));
  const [refundPolicy, setRefundPolicy] = useState(initial.settings.policy?.refundPolicyText ?? "");
  const initialReminders = initial.settings.reminders;
  const [remEnabled, setRemEnabled] = useState(initialReminders?.enabled ?? true);
  const [remPreset, setRemPreset] = useState<string>(() => {
    const offsets = initialReminders?.offsetsHours ?? [24];
    return offsets.length === 2 && offsets.includes(24) && offsets.includes(1)
      ? "24+1"
      : offsets.length === 1 && offsets[0] === 24
        ? "24"
        : offsets.length === 1 && offsets[0] === 48
          ? "48"
          : String(offsets[0] ?? 24);
  });
  const [remSendTo, setRemSendTo] = useState<"client" | "client+studio">(initialReminders?.sendTo ?? "client");
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
    const minor = Math.round(Number(payAmount) * 100);
    const body = {
      rules,
      settings: {
        ...settings,
        // Payment block always sent so the toggle sticks; the amount is kept
        // even when disabled so re-enabling restores it.
        payment: {
          enabled: payEnabled,
          kind: payKind,
          amountMinor: payEnabled ? Math.max(100, minor || 100) : (initial.settings.payment?.amountMinor ?? (minor || 2500)),
        },
        policy: {
          rescheduleCutoffHours: Math.max(0, Math.round(Number(reschedCutoff) || 0)),
          cancelCutoffHours: Math.max(0, Math.round(Number(cancelCutoff) || 0)),
          ...(refundPolicy.trim() ? { refundPolicyText: refundPolicy.trim().slice(0, 2000) } : {}),
        },
        reminders: {
          enabled: remEnabled,
          offsetsHours: remPreset === "24+1" ? [24, 1] : [Math.min(Math.max(Math.round(Number(remPreset) || 24), 1), 168)],
          sendTo: remSendTo,
        },
      },
      blackouts,
    };
    const res = await fetch("/api/studio/availability", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const out = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    setStatus(
      res.ok
        ? "Availability saved."
        : out.error === "connect_required"
          ? "Connect your Stripe account in Settings → Payouts before turning on paid bookings."
          : `Save failed: ${out.error ?? "unknown"}`,
    );
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
        <h2 className="text-[15px] font-medium text-ink">Booking payment</h2>
        <p className="mt-1 text-xs text-ink-subtle">
          When on, clients pay through Stripe at booking — the slot is held until payment completes.
          When off, bookings are confirmed instantly with no payment step.
        </p>
        {!payoutsReady && (
          <div
            id="payConnectNotice"
            role="status"
            className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-ink"
          >
            <strong className="font-medium">Connect your Stripe account to take payments.</strong>{" "}
            {payEnabled
              ? "Payment is on, but clients can't complete a paid booking until Stripe is connected - they'll see a note explaining you can't take online payments yet. Connect now, or turn payment off."
              : "Paid bookings stay off until Stripe is connected. Clients pay you directly, and Stripe's fee comes out of your own Stripe account."}{" "}
            <a href="/dashboard/settings/payouts" className="font-medium text-primary underline underline-offset-2">
              Connect Stripe in Settings → Payouts
            </a>
          </div>
        )}
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="payEnabled">Collect payment</Label>
            <button
              id="payEnabled"
              type="button"
              role="switch"
              aria-checked={payEnabled}
              onClick={() => setPayEnabled((v) => (v ? false : payoutsReady))}
              aria-describedby={payoutsReady ? undefined : "payConnectNotice"}
              className={`relative h-6 w-11 rounded-full transition-colors ${payEnabled ? "bg-primary" : "bg-surface-2 shadow-[inset_0_0_0_1px_var(--hairline)]"}`}
            >
              {/* Thumb is anchored with left-0.5 and moved with translate —
               * translate alone offsets from the span's UA "static position",
               * which inside a <button> is the centered-content point, not the
               * track's left edge (knob rendered at arbitrary offsets). */}
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${payEnabled ? "translate-x-5" : "translate-x-0"}`}
              />
            </button>
            <p className="text-xs text-ink-tertiary">{payEnabled ? "Payment required at booking" : "Free bookings"}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="payKind">Type</Label>
            <select
              id="payKind"
              value={payKind}
              onChange={(e) => setPayKind(e.target.value as "deposit" | "full")}
              disabled={!payEnabled}
              className="snap-select rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
            >
              <option value="deposit">Deposit</option>
              <option value="full">Full session</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="payAmount">Amount ({currency.toUpperCase()})</Label>
            <Input id="payAmount" type="number" min={1} step="0.01" inputMode="decimal" value={payAmount}
              disabled={!payEnabled}
              onChange={(e) => setPayAmount(e.target.value)} />
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-tertiary">
          {payKind === "deposit"
            ? "Deposits hold the date — invoice the balance later from the project."
            : "Charges the full session price at booking time."}{" "}
          Payments go to your Stripe account (Connect Payouts under Settings).
        </p>
      </section>

      <section className={card}>
        <h2 className="text-[15px] font-medium text-ink">Client changes</h2>
        <p className="mt-1 text-xs text-ink-subtle">
          Clients can reschedule or cancel themselves from their booking email until these cutoffs.
          Inside the window, their manage page points them to you instead.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="reschedCutoff">Reschedule cutoff (hours before)</Label>
            <Input id="reschedCutoff" type="number" min={0} max={720} value={reschedCutoff}
              onChange={(e) => setReschedCutoff(e.target.value)} />
            <p className="text-xs text-ink-tertiary">Default 24 — 0 lets clients move it until start time.</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cancelCutoff">Cancel cutoff (hours before)</Label>
            <Input id="cancelCutoff" type="number" min={0} max={720} value={cancelCutoff}
              onChange={(e) => setCancelCutoff(e.target.value)} />
            <p className="text-xs text-ink-tertiary">Default 48 — 0 lets clients cancel until start time.</p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <Label htmlFor="refundPolicy">Refund policy (shown when clients cancel a prepaid session)</Label>
          <textarea
            id="refundPolicy"
            value={refundPolicy}
            onChange={(e) => setRefundPolicy(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="e.g. Deposits are refundable up to 7 days before the session; inside 7 days the deposit transfers to a future date."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="text-xs text-ink-tertiary">
            Refunds themselves stay in your hands — issue them from Stripe when you're ready.
          </p>
        </div>
      </section>

      <section className={card}>
        <h2 className="text-[15px] font-medium text-ink">Reminders</h2>
        <p className="mt-1 text-xs text-ink-subtle">
          Automatic email reminders before each session — the single best fix for no-shows. Each reminder sends exactly once.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="remEnabled">Send reminders</Label>
            <button
              id="remEnabled"
              type="button"
              role="switch"
              aria-checked={remEnabled}
              onClick={() => setRemEnabled((v) => !v)}
              className={`relative h-6 w-11 rounded-full transition-colors ${remEnabled ? "bg-primary" : "bg-surface-2 shadow-[inset_0_0_0_1px_var(--hairline)]"}`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${remEnabled ? "translate-x-5" : "translate-x-0"}`}
              />
            </button>
            <p className="text-xs text-ink-tertiary">{remEnabled ? "On — clients hear from you before every session" : "Off"}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="remPreset">When</Label>
            <select
              id="remPreset"
              value={remPreset}
              onChange={(e) => setRemPreset(e.target.value)}
              disabled={!remEnabled}
              className="snap-select rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
            >
              <option value="24">24 hours before</option>
              <option value="24+1">24 hours + 1 hour before</option>
              <option value="48">48 hours before</option>
              <option value="12">12 hours before</option>
              <option value="4">4 hours before</option>
              <option value="72">72 hours before</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="remSendTo">Also notify</Label>
            <select
              id="remSendTo"
              value={remSendTo}
              onChange={(e) => setRemSendTo(e.target.value as "client" | "client+studio")}
              disabled={!remEnabled}
              className="snap-select rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
            >
              <option value="client">Just the client</option>
              <option value="client+studio">Client + me</option>
            </select>
            <p className="text-xs text-ink-tertiary">The client email is branded and includes a calendar invite.</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-tertiary">
          Reminders ride the daily 6:00 UTC pass — a “24 hours before” reminder may land a few hours early when the timing straddles
          the daily run. You can edit the copy under Templates → Emails.
        </p>
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
