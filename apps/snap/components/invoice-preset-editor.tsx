"use client";

/* Invoice preset editor (WEB-286) — default line items with a live PDF
 * preview rendered by the REAL invoice pipeline (sample client/project),
 * so what you see is what clients get when the preset is applied. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@webcules/ui/components/button";
import type { PresetLine } from "@/lib/invoice-settings";

const input = "rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-primary";

function fmtUsd(minor: number): string {
  return (minor / 100).toFixed(2);
}

export function InvoicePresetEditor({
  templateId,
  initialName,
  initialLines,
}: {
  templateId?: string;
  initialName?: string;
  initialLines?: PresetLine[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName ?? "");
  const [lines, setLines] = useState<PresetLine[]>(initialLines?.length ? initialLines : [{ description: "", qty: 1, amountMinor: 0 }]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  /** WEB-252: presets_require_lite arrives as a 403 — upsell, don't error. */
  const [upsell, setUpsell] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  const total = lines.reduce((n, l) => n + l.qty * l.amountMinor, 0);
  const valid = name.trim().length > 0 && lines.some((l) => l.description.trim() && l.amountMinor > 0);

  function setLine(i: number, patch: Partial<PresetLine>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    setStatus(null);
    const payload = {
      name: name.trim(),
      body: JSON.stringify(lines.filter((l) => l.description.trim() && l.amountMinor > 0)),
    };
    const res = templateId
      ? await fetch(`/api/studio/templates/${templateId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      : await fetch("/api/studio/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "invoice_preset", ...payload }),
        });
    const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    setBusy(false);
    if (!res.ok || (templateId ? false : !body.id)) {
      setUpsell(body.error === "presets_require_lite" || body.error === "limit_reached");
      setStatus(
        body.error === "presets_require_lite"
          ? "Invoice presets are included with Lite."
          : body.error === "limit_reached"
            ? "Plan limit reached."
            : "Couldn't save — try again.",
      );
      return;
    }
    setUpsell(false);
    setPreviewKey((k) => k + 1);
    if (templateId) {
      setStatus("Saved — preview refreshed.");
    } else {
      router.replace(`/dashboard/templates/invoice-presets?edit=${body.id}`);
      router.refresh();
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
      <section className="flex flex-col gap-3 rounded-[12px] border border-hairline bg-surface-1 p-5">
        <label className="flex flex-col gap-1 text-xs text-ink-subtle">
          Preset name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Wedding Collection" className={input} />
        </label>
        <p className="text-xs text-ink-tertiary">These lines pre-fill the invoice composer when you pick the preset on a project&apos;s Payments tab.</p>
        <div className="flex flex-col divide-y divide-hairline">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_64px_104px_32px] items-center gap-2 py-2 first:pt-0">
              <input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} maxLength={200} placeholder="Line description (e.g. 8-hour coverage)" className={input} />
              <input
                value={String(l.qty)}
                onChange={(e) => setLine(i, { qty: Math.min(999, Math.max(1, Math.floor(Number(e.target.value.replace(/\D/g, "")) || 1))) })}
                inputMode="numeric"
                aria-label="Quantity"
                className={input}
              />
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-tertiary">$</span>
                <input
                  value={fmtUsd(l.amountMinor)}
                  onChange={(e) => {
                    const dollars = Number(e.target.value.replace(/[^0-9.]/g, ""));
                    setLine(i, { amountMinor: Number.isFinite(dollars) ? Math.round(dollars * 100) : 0 });
                  }}
                  inputMode="decimal"
                  aria-label="Amount"
                  className={`${input} pl-7`}
                />
              </div>
              <Button size="sm" variant="ghost" aria-label={`Remove line ${i + 1}`} onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>
                <Trash2 className="h-3.5 w-3.5 text-red-500" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <Button size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, { description: "", qty: 1, amountMinor: 0 }])}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Add line
          </Button>
          <p className="text-sm text-ink-subtle">
            Total <strong className="font-semibold text-ink">${fmtUsd(total)}</strong>
          </p>
        </div>
        <div className="flex items-center gap-3 border-t border-hairline pt-3">
          <Button size="sm" onClick={save} disabled={!valid || busy}>
            {busy ? "Saving…" : templateId ? "Save preset" : "Create preset"}
          </Button>
          {status && <span className="text-xs text-ink-subtle">{status}</span>}
          {upsell && (
            <a href="/dashboard/settings/billing" className="text-xs font-medium text-primary underline underline-offset-2">
              Upgrade to Lite — $15/mo
            </a>
          )}
        </div>
      </section>

      <aside className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-ink">PDF preview</h3>
          <span className="text-xs text-ink-tertiary">real invoice renderer</span>
        </div>
        {templateId ? (
          <iframe
            key={previewKey}
            src={`/api/studio/templates/${templateId}/preview`}
            title="Invoice preset preview"
            className="h-[620px] w-full rounded-[12px] border border-hairline bg-white"
          />
        ) : (
          <p className="rounded-[12px] border border-hairline bg-surface-1 p-4 text-xs text-ink-subtle">
            Save the preset once and the live PDF preview appears here — exactly what the client receives.
          </p>
        )}
      </aside>
    </div>
  );
}
