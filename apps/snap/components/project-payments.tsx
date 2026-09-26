"use client";

/* Project payments (WEB-156 + WEB-135): ledger with refund action for Stripe
 * rows, manual/offline entry with void, and the quoted-total anchor that
 * drives the derived paid/partial/unpaid badge (also shown on the kanban). */
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@webcules/ui/components/button";

export type PaymentItem = {
  id: string;
  kind: string;
  amountMinor: number;
  currency: string;
  status: string;
  occurredAt: string | null;
  method: string | null;
  note: string | null;
  stripePaymentIntentId: string | null;
};

export type PaymentSummary = {
  quotedTotalMinor: number | null;
  currency: string;
  collectedMinor: number;
  refundedMinor: number;
  status: "unpaid" | "partial" | "paid" | "overpaid" | "none";
  paymentCount: number;
};

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  refunding: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  succeeded: "bg-success/10 text-success-text",
  failed: "bg-destructive/10 text-destructive",
  refunded: "bg-surface-2 text-ink-subtle",
};

const SUMMARY_TONE: Record<PaymentSummary["status"], string> = {
  unpaid: "bg-destructive/10 text-destructive",
  partial: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  paid: "bg-success/10 text-success-text",
  overpaid: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  none: "bg-surface-2 text-ink-subtle",
};

const METHODS: { value: string; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "etransfer", label: "E-transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "card_offline", label: "Card (offline)" },
  { value: "other", label: "Other" },
];

function money(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amountMinor / 100);
}

export function ProjectPayments({ projectId, payments, summary }: { projectId: string; payments: PaymentItem[]; summary: PaymentSummary }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [quoteInput, setQuoteInput] = useState(
    summary.quotedTotalMinor !== null ? String(summary.quotedTotalMinor / 100) : "",
  );

  async function refund(id: string) {
    if (!confirm("Refund this payment in full? The booking will be canceled and the client emailed.")) return;
    setBusy(id);
    setError("");
    try {
      const res = await fetch(`/api/payments/${id}/refund`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(
          body.error === "already_refunded"
            ? "Already refunded."
            : "Refund failed — check that Stripe can process it, then retry.",
        );
      } else {
        setNotice("Refund issued — it shows as Refunding now and confirms once Stripe processes it.");
        router.refresh();
      }
    } catch {
      setError("Network error — try again.");
    }
    setBusy(null);
  }

  async function voidEntry(id: string) {
    if (!confirm("Void this manual entry? It stays in the ledger as voided.")) return;
    setBusy(id);
    setError("");
    try {
      const res = await fetch(`/api/payments/${id}/void`, { method: "POST" });
      if (!res.ok) throw new Error();
      setNotice("Entry voided.");
      router.refresh();
    } catch {
      setError("Could not void — try again.");
    }
    setBusy(null);
  }

  async function saveQuote() {
    setBusy("quote");
    setError("");
    try {
      const minor = quoteInput.trim() === "" ? null : Math.round(Number(quoteInput) * 100);
      if (minor !== null && (!Number.isFinite(minor) || minor < 0)) throw new Error();
      const res = await fetch(`/api/projects/${projectId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "quote", quotedTotalMinor: minor }),
      });
      if (!res.ok) throw new Error();
      setNotice(minor === null ? "Quoted total cleared." : "Quoted total saved.");
      router.refresh();
    } catch {
      setError("Enter a valid amount (or clear it).");
    }
    setBusy(null);
  }

  async function addManual() {
    setBusy("add");
    setError("");
    try {
      const minor = Math.round(Number(amount) * 100);
      if (!Number.isFinite(minor) || minor <= 0) throw new Error();
      const res = await fetch(`/api/projects/${projectId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "manual", amountMinor: minor, method, note: note || undefined }),
      });
      if (!res.ok) throw new Error();
      setAmount("");
      setNote("");
      setShowAdd(false);
      setNotice("Payment recorded.");
      router.refresh();
    } catch {
      setError("Enter a valid amount.");
    }
    setBusy(null);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* derived money state */}
      <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-hairline bg-surface-1 px-4 py-3 text-sm">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${SUMMARY_TONE[summary.status]}`}>
          {summary.status === "none" ? "no quote set" : summary.status}
        </span>
        <span className="text-ink">
          <strong>{money(summary.collectedMinor, summary.currency)}</strong> collected
        </span>
        {summary.quotedTotalMinor !== null && (
          <span className="text-ink-subtle">of {money(summary.quotedTotalMinor, summary.currency)} quoted</span>
        )}
        {summary.refundedMinor > 0 && (
          <span className="text-xs text-ink-tertiary">{money(summary.refundedMinor, summary.currency)} refunded</span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <input
            value={quoteInput}
            onChange={(e) => setQuoteInput(e.target.value)}
            placeholder="Quote total"
            inputMode="decimal"
            className="w-24 rounded-md border border-hairline bg-canvas px-2 py-1 text-sm text-ink"
            aria-label="Quoted total"
          />
          <Button size="sm" variant="outline" disabled={busy === "quote"} onClick={() => void saveQuote()}>
            Set quote
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setShowAdd((v) => !v)}>
            Record payment
          </Button>
        </span>
      </div>

      {showAdd && (
        <div className="flex flex-wrap items-end gap-2 rounded-[12px] border border-hairline bg-surface-1 px-4 py-3">
          <label className="flex flex-col gap-1 text-xs text-ink-subtle">
            Amount
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="250.00"
              className="w-28 rounded-md border border-hairline bg-canvas px-2 py-1.5 text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-subtle">
            Method
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="rounded-md border border-hairline bg-canvas px-2 py-1.5 text-sm text-ink"
            >
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs text-ink-subtle">
            Note (optional)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Balance after session"
              className="rounded-md border border-hairline bg-canvas px-2 py-1.5 text-sm text-ink"
            />
          </label>
          <Button size="sm" disabled={busy === "add"} onClick={() => void addManual()}>
            {busy === "add" ? "Saving…" : "Add"}
          </Button>
        </div>
      )}

      {payments.length === 0 && <p className="text-sm text-ink-subtle">No payments on this project yet.</p>}
      {notice && <p className="text-xs text-success-text">{notice}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {payments.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-[12px] border border-hairline bg-surface-1 px-4 py-3 text-sm">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[p.status] ?? ""}`}>{p.status}</span>
          <span className="text-ink-muted">
            {p.kind === "manual" ? (METHODS.find((m) => m.value === p.method)?.label ?? p.method ?? "manual") : p.kind}
          </span>
          <span className="font-medium text-ink">{money(p.amountMinor, p.currency)}</span>
          {p.note && <span className="max-w-64 truncate text-xs text-ink-tertiary" title={p.note}>{p.note}</span>}
          <span className="text-xs text-ink-tertiary">{(p.occurredAt ?? "").slice(0, 10)}</span>
          {p.status === "succeeded" && p.stripePaymentIntentId && (
            <Button size="sm" variant="outline" className="ml-auto" disabled={busy === p.id} onClick={() => void refund(p.id)}>
              {busy === p.id ? "Refunding…" : "Refund"}
            </Button>
          )}
          {p.status === "succeeded" && !p.stripePaymentIntentId && (
            <Button size="sm" variant="outline" className="ml-auto" disabled={busy === p.id} onClick={() => void voidEntry(p.id)}>
              {busy === p.id ? "Voiding…" : "Void"}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
