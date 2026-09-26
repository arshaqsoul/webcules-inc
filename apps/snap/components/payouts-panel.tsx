"use client";

/* Settings → Payouts (WEB-154) — Stripe Connect Express onboarding + live
 * status. WEB-157 extends this panel with balance/payout schedule; the state
 * machine lives in lib/connect.ts and is refreshed from Stripe on every view. */
import { useCallback, useEffect, useState } from "react";

import { Button } from "@webcules/ui/components/button";

type ConnectStatus = {
  state: "not_connected" | "pending" | "active" | "restricted";
  accountId: string | null;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  disabledReason?: string | null;
  pastDue?: string[];
  pendingVerification?: string[];
  payoutSchedule?: { interval?: string; delay_days?: number } | null;
  balance?: { availableMinor: number; pendingMinor: number; currency: string } | null;
  lastPayout?: { amountMinor: number; currency: string; arrivalAt: string; status: string } | null;
};

function money(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amountMinor / 100);
}

function humanizeRequirement(req: string): string {
  const readable = req
    .replace(/^individual\./, "your ")
    .replace(/^company\./, "the business ")
    .replace(/[._]/g, " ")
    .replace(/verification /, "");
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}

const STATE_COPY: Record<ConnectStatus["state"], { label: string; tone: string; body: string }> = {
  not_connected: {
    label: "Not connected",
    tone: "bg-surface-2 text-ink-subtle",
    body: "Connect a Stripe account to receive booking payments directly. Clients pay you — Snap takes $0 of the booking.",
  },
  pending: {
    label: "Setup in progress",
    tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    body: "Your Stripe account is created but onboarding isn't finished. Payments require the remaining steps.",
  },
  active: {
    label: "Connected",
    tone: "bg-success/10 text-success-text",
    body: "Booking payments land directly in your Stripe balance — Snap takes $0 of the booking.",
  },
  restricted: {
    label: "Needs attention",
    tone: "bg-destructive/10 text-destructive",
    body: "Stripe needs updated information (or re-authorization) before payments can continue.",
  },
};

export function PayoutsPanel({ returnHint }: { returnHint?: string }) {
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/studio/payouts");
      if (res.ok) setStatus((await res.json()) as ConnectStatus);
    } catch { /* panel simply stays on cached render */ }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function startConnect(update: boolean) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/studio/payouts/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ update }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.ok && body.url) {
        window.location.href = body.url; // Stripe-hosted onboarding
      } else {
        setError(
          body.error === "connect_not_enabled"
            ? "Stripe Connect isn't enabled on the Snap platform account yet — contact the platform admin."
            : "Couldn't start Stripe onboarding — try again in a moment.",
        );
      }
    } catch {
      setError("Network error — try again.");
    }
    setBusy(false);
  }

  async function openExpressDashboard() {
    setBusy(true);
    try {
      const res = await fetch("/api/studio/payouts/express-login", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { url?: string };
      if (res.ok && body.url) window.open(body.url, "_blank", "noreferrer");
    } catch { /* ignore */ }
    setBusy(false);
  }

  const copy = status ? STATE_COPY[status.state] : null;

  return (
    <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-medium text-ink">Payouts</h2>
          <p className="mt-0.5 text-xs text-ink-subtle">Get paid directly for bookings via Stripe.</p>
        </div>
        {copy && (
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${copy.tone}`}>{copy.label}</span>
        )}
      </div>

      <p className="mt-3 text-sm leading-relaxed text-ink-subtle">
        {copy?.body ?? "Checking your Stripe connection…"}
      </p>

      {returnHint === "return" && status?.state === "active" && (
        <p className="mt-2 text-xs text-success-text">Onboarding complete — you're connected.</p>
      )}
      {returnHint === "refresh" && (
        <p className="mt-2 text-xs text-ink-tertiary">If the link expired, click below to get a fresh one.</p>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      {status?.state === "restricted" && (status.pastDue?.length ?? 0) > 0 && (
        <p className="mt-2 text-xs text-ink-tertiary">
          Pending with Stripe: {status.pastDue!.map(humanizeRequirement).join(", ")}.
        </p>
      )}

      {status?.state === "active" && status.balance && (
        <div className="mt-4 grid grid-cols-3 gap-3 rounded-[12px] border border-hairline bg-surface-1 p-4 text-sm">
          <div>
            <p className="text-xs text-ink-tertiary">Available</p>
            <p className="font-medium text-ink">{money(status.balance.availableMinor, status.balance.currency)}</p>
          </div>
          <div>
            <p className="text-xs text-ink-tertiary">Pending</p>
            <p className="font-medium text-ink">{money(status.balance.pendingMinor, status.balance.currency)}</p>
          </div>
          <div>
            <p className="text-xs text-ink-tertiary">Last payout</p>
            <p className="font-medium text-ink">
              {status.lastPayout
                ? `${money(status.lastPayout.amountMinor, status.lastPayout.currency)} · ${new Date(status.lastPayout.arrivalAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                : "—"}
            </p>
          </div>
          {status.payoutSchedule?.interval && (
            <p className="col-span-3 text-xs text-ink-tertiary">
              Payout schedule: {status.payoutSchedule.interval}
              {status.payoutSchedule.delay_days ? ` · ${status.payoutSchedule.delay_days}-day delay` : ""}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {(!status || status.state === "not_connected") && (
          <Button size="sm" disabled={busy} onClick={() => void startConnect(false)}>
            {busy ? "Redirecting…" : "Connect payouts"}
          </Button>
        )}
        {status?.state === "pending" && (
          <Button size="sm" disabled={busy} onClick={() => void startConnect(false)}>
            {busy ? "Redirecting…" : "Resume onboarding"}
          </Button>
        )}
        {status?.state === "restricted" && (
          <Button size="sm" disabled={busy} onClick={() => void startConnect(true)}>
            {busy ? "Redirecting…" : "Update with Stripe"}
          </Button>
        )}
        {status?.state === "active" && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void openExpressDashboard()}>
            Stripe dashboard
          </Button>
        )}
        {status && status.state !== "not_connected" && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void refresh()}>
            Refresh status
          </Button>
        )}
      </div>

      {status?.accountId && (
        <p className="mt-3 text-xs text-ink-tertiary">Stripe account {status.accountId}</p>
      )}
    </section>
  );
}
