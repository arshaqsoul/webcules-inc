"use client";

/* Invoice design card (WEB-252) — Settings → Billing. Numbering, default
 * tax, terms and memo; snapshotted per invoice at creation. */
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@webcules/ui/components/button";
import type { InvoiceSettings } from "@/lib/invoice-settings";

export function InvoiceDesignCard({ initial }: { initial: InvoiceSettings }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const set = (patch: Partial<InvoiceSettings>) => setS((cur) => ({ ...cur, ...patch }));
  const label = "flex flex-col gap-1 text-xs text-ink-subtle";
  const input = "rounded-md border border-hairline bg-canvas px-2.5 py-2 text-sm text-ink outline-none focus:border-primary";

  async function save() {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/studio/invoice-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      });
      setStatus(res.ok ? "Saved — new invoices pick this up; existing ones never change." : "Couldn't save — try again.");
      if (res.ok) router.refresh();
    } catch {
      setStatus("Network error — try again.");
    }
    setBusy(false);
  }

  return (
    <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
      <h2 className="text-[15px] font-medium text-ink">Invoice design</h2>
      <p className="mb-4 mt-1 text-xs text-ink-subtle">
        Numbering, taxes, terms and notes — applied to new invoices; each invoice freezes its format at creation.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label}>
          Number prefix
          <input value={s.numberPrefix} onChange={(e) => set({ numberPrefix: e.target.value })} placeholder="INV-" className={input} />
        </label>
        <label className={label}>
          Number padding
          <input type="number" min={3} max={6} value={s.numberPadding} onChange={(e) => set({ numberPadding: Number(e.target.value) })} className={input} />
        </label>
        <label className={label}>
          Reset each year
          <select value={s.resetYearly ? "yes" : "no"} onChange={(e) => set({ resetYearly: e.target.value === "yes" })} className="snap-select rounded-md border border-hairline bg-canvas px-2 py-2 text-sm text-ink outline-none">
            <option value="no">Continuous</option>
            <option value="yes">Restart yearly</option>
          </select>
        </label>
        <label className={label}>
          Tax label
          <input value={s.taxLabel} onChange={(e) => set({ taxLabel: e.target.value })} placeholder="Sales tax 8.25%" className={input} />
        </label>
        <label className={label}>
          Tax rate (%)
          <input type="number" min={0} max={200} step="0.01" value={s.taxRateBps / 100} onChange={(e) => set({ taxRateBps: Math.round(Number(e.target.value) * 100) })} placeholder="0" className={input} />
        </label>
        <label className={label}>
          Default due (days)
          <select value={s.dueDays} onChange={(e) => set({ dueDays: Number(e.target.value) })} className="snap-select rounded-md border border-hairline bg-canvas px-2 py-2 text-sm text-ink outline-none">
            {[0, 7, 14, 30].map((d) => (
              <option key={d} value={d}>{d === 0 ? "On receipt" : `Net ${d}`}</option>
            ))}
          </select>
        </label>
        <label className={`${label} sm:col-span-3`}>
          Default notes (memo)
          <textarea value={s.memo} onChange={(e) => set({ memo: e.target.value })} placeholder="Travel included within 50 km…" className={`${input} min-h-16`} />
        </label>
        <label className={`${label} sm:col-span-3`}>
          Payment terms
          <textarea value={s.termsText} onChange={(e) => set({ termsText: e.target.value })} placeholder="Payment due within 14 days. Merge fields like {{studio_email}} work here." className={`${input} min-h-16`} />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={save} disabled={busy} size="sm">{busy ? "Saving…" : "Save invoice design"}</Button>
        {status && <span className="text-xs text-ink-subtle">{status}</span>}
      </div>
    </section>
  );
}
