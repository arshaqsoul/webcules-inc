"use client";

/* Project payments list + refund action (WEB-156). Refund issues via Stripe;
 * the charge.refunded webhook flips the row to refunded + cancels the booking. */
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
};

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  refunding: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  succeeded: "bg-success/10 text-success-text",
  failed: "bg-destructive/10 text-destructive",
  refunded: "bg-surface-2 text-ink-subtle",
};

export function ProjectPayments({ payments }: { payments: PaymentItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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

  return (
    <div className="flex flex-col gap-3">
      {payments.length === 0 && <p className="text-sm text-ink-subtle">No payments on this project yet.</p>}
      {notice && <p className="text-xs text-success-text">{notice}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {payments.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-[12px] border border-hairline bg-surface-1 px-4 py-3 text-sm">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[p.status] ?? ""}`}>{p.status}</span>
          <span className="text-ink-muted">{p.kind}</span>
          <span className="font-medium text-ink">
            {new Intl.NumberFormat("en-US", { style: "currency", currency: p.currency.toUpperCase() }).format(p.amountMinor / 100)}
          </span>
          <span className="text-xs text-ink-tertiary">
            {(p.occurredAt ?? "").slice(0, 10)}
          </span>
          {p.status === "succeeded" && (
            <Button size="sm" variant="outline" className="ml-auto" disabled={busy === p.id} onClick={() => void refund(p.id)}>
              {busy === p.id ? "Refunding…" : "Refund"}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
