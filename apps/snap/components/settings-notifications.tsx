"use client";

/* Settings → Notifications (WEB-278) — toggles for the INTERNAL studio
 * alerts (emails to the photographer). Client transactional emails are
 * never suppressible here (per-client opt-out remains the mechanism), which
 * the card copy states plainly. */
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@webcules/ui/components/button";

type Prefs = Record<string, boolean | undefined>;

const ALERTS: { key: string; label: string; hint: string }[] = [
  { key: "inquiry", label: "New inquiries", hint: "Booking page or contact-form submissions, client email replies" },
  { key: "booking", label: "New bookings", hint: "A paid booking lands through your booking page" },
  { key: "booking_change", label: "Booking changes", hint: "Client reschedules or cancels" },
  { key: "contract_signed", label: "Contract activity", hint: "A contract goes out or comes back signed" },
  { key: "invoice", label: "Payments", hint: "Invoices paid or payments refunded" },
  { key: "gallery", label: "Gallery activity", hint: "A gallery is delivered or first viewed by the client" },
  { key: "order", label: "Orders", hint: "Client orders paid or shipped" },
  { key: "storage", label: "Storage warnings", hint: "Storage crosses 90% of your plan" },
  { key: "raw_archive", label: "RAW Vault notices", hint: "Archive confirmations, purge warnings, renewals" },
];

function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-hairline bg-background px-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm text-ink">{label}</span>
        <span className="block text-xs text-ink-subtle">{hint}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full border border-input bg-surface-2 transition-colors before:block before:h-4 before:w-4 before:translate-x-0 before:rounded-full before:bg-ink-subtle before:transition-transform checked:border-primary checked:bg-primary checked:before:translate-x-4 checked:before:bg-white disabled:opacity-50"
      />
    </label>
  );
}

export function SettingsNotifications({
  notificationPrefs: prefsJson,
  clientNotifyDefault: initialClientDefault,
}: {
  notificationPrefs: string | null;
  clientNotifyDefault: boolean;
}) {
  const router = useRouter();
  const initial: Prefs = (() => {
    try {
      return JSON.parse(prefsJson || "{}") as Prefs;
    } catch {
      return {};
    }
  })();
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [clientDefault, setClientDefault] = useState(initialClientDefault);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  function dirty(): boolean {
    if (clientDefault !== initialClientDefault) return true;
    return ALERTS.some((a) => Boolean(prefs[a.key]) !== Boolean(initial[a.key]));
  }

  async function save() {
    setBusy(true);
    setStatus(null);
    const payload: Record<string, boolean> = {};
    for (const a of ALERTS) payload[a.key] = prefs[a.key] !== false;
    const res = await fetch("/api/studio/brand", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationPrefs: payload, clientNotifyDefault: clientDefault }),
    });
    setBusy(false);
    setStatus(res.ok ? "Saved." : "Save failed — try again.");
    if (res.ok) router.refresh();
  }

  return (
    <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
      <h2 className="text-[15px] font-medium text-ink">Studio alerts</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-subtle">
        Choose which updates reach you. These toggles govern both alert emails to{" "}
        <em>you</em> and what lands in your Snap inbox. Client email runs in two streams: contracts and
        invoices/receipts always send, while gallery links, booking emails and reminders follow each client's
        email preference — clients control that in their portal, and “New client emails” below sets your default.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {ALERTS.map((a) => (
          <Toggle
            key={a.key}
            label={a.label}
            hint={a.hint}
            checked={prefs[a.key] !== false}
            onChange={(v) => setPrefs((p) => ({ ...p, [a.key]: v }))}
          />
        ))}
      </div>

      <h2 className="mt-6 text-[15px] font-medium text-ink">New client emails</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-subtle">
        The default for clients added from now on. Existing clients keep their own setting — change it
        per client anytime.
      </p>
      <div className="mt-3">
        <Toggle
          label="New clients receive gallery & booking emails"
          hint="Recommended — delivery links are how clients receive their photos"
          checked={clientDefault}
          onChange={setClientDefault}
        />
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        {status && <p className="text-sm text-ink-subtle">{status}</p>}
        <Button onClick={save} size="sm" disabled={busy || !dirty()}>
          {busy ? "Saving…" : "Save notifications"}
        </Button>
      </div>
    </section>
  );
}
