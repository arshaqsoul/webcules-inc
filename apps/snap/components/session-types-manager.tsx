"use client";

/* Session types manager (WEB-250) — the event-type definer. Cards with
 * color/duration/price/deposit, availability scoping, booking questions and
 * per-type gallery defaults. Tier gate surfaces the upgrade path. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@webcules/ui/components/button";

export type SessionTypeView = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  slotMinutes: number | null;
  priceMinor: number | null;
  depositKind: string | null;
  depositMinor: number | null;
  availabilityMode: string;
  bookingFormTemplateId: string | null;
  active: boolean;
};

const COLORS = ["#5e6ad2", "#e5912d", "#1e8e3e", "#c0271f", "#8f5fee", "#0ea5e9", "#db2777", "#62666d"];

const input = "rounded-md border border-hairline bg-canvas px-2.5 py-2 text-sm text-ink outline-none focus:border-primary";

function money(minor: number | null): string {
  return minor === null || minor === undefined ? "" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(minor / 100);
}

export function SessionTypesManager({
  initial,
  formTemplates,
  limit,
}: {
  initial: SessionTypeView[];
  formTemplates: Array<{ id: string; name: string }>;
  limit: number | null;
}) {
  const router = useRouter();
  const [types, setTypes] = useState(initial);
  const [editing, setEditing] = useState<SessionTypeView | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const activeCount = types.filter((t) => t.active).length;
  const atLimit = limit !== null && activeCount >= limit;

  async function remove(id: string) {
    if (!confirm("Delete this session type? Existing bookings keep their history; their rules are removed.")) return;
    setTypes((ts) => ts.filter((t) => t.id !== id));
    await fetch(`/api/studio/session-types/${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function move(id: string, dir: -1 | 1) {
    const i = types.findIndex((t) => t.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= types.length) return;
    const next = [...types];
    [next[i], next[j]] = [next[j], next[i]];
    setTypes(next);
    await fetch(`/api/studio/session-types/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reorder", orderedIds: next.map((t) => t.id) }),
    });
  }

  async function save(t: SessionTypeView) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const payload = {
        name: t.name,
        description: t.description || null,
        color: t.color || null,
        slotMinutes: t.slotMinutes || null,
        bufferMinutes: null,
        minLeadHours: null,
        maxAdvanceDays: null,
        priceMinor: t.priceMinor ?? null,
        depositKind: (t.depositKind as "off" | "deposit" | "full" | null) ?? null,
        depositMinor: t.depositMinor ?? null,
        availabilityMode: t.availabilityMode === "own" ? "own" : "inherit",
        bookingFormTemplateId: t.bookingFormTemplateId || null,
        active: t.active,
      };
      const res = await fetch(editing === "new" ? "/api/studio/session-types" : `/api/studio/session-types/${t.id}`, {
        method: editing === "new" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; limit?: number | null };
      if (!res.ok) {
        setError(
          body.error === "limit_reached"
            ? `Your plan includes ${body.limit ?? limit} session type${body.limit === 1 ? "" : "s"} — upgrade in Settings → Billing for more.`
            : body.error === "invalid_template"
              ? "That booking form no longer exists."
              : "Couldn't save — check the values.",
        );
        return;
      }
      setEditing(null);
      const listed = (await fetch("/api/studio/session-types").then((r) => r.json()).catch(() => null)) as { types?: SessionTypeView[] } | null;
      if (listed?.types) setTypes(listed.types);
      router.refresh();
    } catch {
      setError("Network error — try again.");
    }
    setBusy(false);
  }

  const card = "rounded-[12px] border border-hairline bg-surface-1 p-5";

  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-medium text-ink">Session types</h2>
          <p className="mt-0.5 text-xs text-ink-subtle">
            Give each offering its own duration, price, deposit and availability — clients pick a type, then a time.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing("new")} disabled={atLimit}>
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden /> New type
        </Button>
      </div>
      {atLimit && editing !== "new" && (
        <p className="mt-2 text-xs text-ink-subtle">
          {limit === 1 ? "Your plan includes 1 session type." : `Your plan includes ${limit} session types.`}{" "}
          <a href="/dashboard/settings/billing" className="font-medium text-primary hover:underline">Upgrade</a> for more.
        </p>
      )}

      <ul className="mt-3 flex flex-col divide-y divide-hairline">
        {types.length === 0 && <li className="py-2 text-sm text-ink-subtle">No session types — booking runs on your studio-wide settings.</li>}
        {types.map((t, i) => (
          <li key={t.id} className="flex items-center gap-3 py-2.5 first:pt-1">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color ?? "#5e6ad2" }} />
            <button type="button" onClick={() => setEditing(t)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-medium text-ink">{t.name}</span>
              <span className="block truncate text-xs text-ink-subtle">
                {t.slotMinutes ? `${t.slotMinutes} min` : "studio duration"}
                {t.priceMinor ? ` · ${money(t.priceMinor)}` : ""}
                {t.depositKind === "deposit" ? ` · deposit ${money(t.depositMinor)}` : t.depositKind === "full" ? " · paid in full" : ""}
                {` · ${t.availabilityMode === "own" ? "own hours" : "studio hours"}`}
                {!t.active ? " · inactive" : ""}
              </span>
            </button>
            <Button size="sm" variant="ghost" aria-label="Move up" onClick={() => move(t.id, -1)} disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" aria-hidden /></Button>
            <Button size="sm" variant="ghost" aria-label="Move down" onClick={() => move(t.id, 1)} disabled={i === types.length - 1}><ArrowDown className="h-3.5 w-3.5" aria-hidden /></Button>
            <Button size="sm" variant="ghost" aria-label="Delete" onClick={() => remove(t.id)}><Trash2 className="h-3.5 w-3.5 text-red-500" aria-hidden /></Button>
          </li>
        ))}
      </ul>

      {editing !== null && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[1px]" onClick={() => setEditing(null)} aria-hidden />
      )}
      {editing !== null && (
        <aside
          role="dialog"
          aria-label="Session type"
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-y-auto border-l border-hairline bg-surface p-5 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-sm font-semibold text-ink">{editing === "new" ? "New session type" : "Edit session type"}</h3>
          <TypeForm
            key={editing === "new" ? "new" : editing.id}
            value={editing === "new"
              ? { id: "", name: "", slug: "", description: null, color: COLORS[0], slotMinutes: null, priceMinor: null, depositKind: null, depositMinor: null, availabilityMode: "inherit", bookingFormTemplateId: null, active: true }
              : editing}
            formTemplates={formTemplates}
            busy={busy}
            error={error}
            onCancel={() => setEditing(null)}
            onSave={save}
          />
        </aside>
      )}
    </section>
  );
}

function TypeForm({
  value,
  formTemplates,
  busy,
  error,
  onCancel,
  onSave,
}: {
  value: SessionTypeView;
  formTemplates: Array<{ id: string; name: string }>;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onSave: (t: SessionTypeView) => void;
}) {
  const [t, setT] = useState(value);
  const set = (patch: Partial<SessionTypeView>) => setT((cur) => ({ ...cur, ...patch }));
  const label = "flex flex-col gap-1 text-xs text-ink-subtle";

  return (
    <div className="mt-4 flex flex-col gap-3">
      <label className={label}>
        Name
        <input value={t.name} onChange={(e) => set({ name: e.target.value })} placeholder="Mini session" className={input} />
      </label>
      <label className={label}>
        Short description (shown on the booking cards)
        <textarea value={t.description ?? ""} onChange={(e) => set({ description: e.target.value })} className={`${input} min-h-16`} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          Duration (minutes)
          <input type="number" min={5} max={1440} value={t.slotMinutes ?? ""} onChange={(e) => set({ slotMinutes: e.target.value ? Number(e.target.value) : null })} className={input} placeholder="studio default" />
        </label>
        <label className={label}>
          Price (USD)
          <input type="number" min={0} step="0.01" value={t.priceMinor !== null && t.priceMinor !== undefined ? t.priceMinor / 100 : ""} onChange={(e) => set({ priceMinor: e.target.value ? Math.round(Number(e.target.value) * 100) : null })} className={input} placeholder="optional" />
        </label>
        <label className={label}>
          Payment at booking
          <select value={t.depositKind ?? ""} onChange={(e) => set({ depositKind: e.target.value || null })} className="snap-select rounded-md border border-hairline bg-canvas px-2 py-2 text-sm text-ink outline-none">
            <option value="">Studio setting</option>
            <option value="off">No payment</option>
            <option value="deposit">Deposit</option>
            <option value="full">Full amount</option>
          </select>
        </label>
        <label className={label}>
          Deposit amount (USD)
          <input type="number" min={1} step="0.01" disabled={t.depositKind !== "deposit" && t.depositKind !== "full"} value={t.depositMinor !== null && t.depositMinor !== undefined ? t.depositMinor / 100 : ""} onChange={(e) => set({ depositMinor: e.target.value ? Math.round(Number(e.target.value) * 100) : null })} className={input} placeholder="—" />
        </label>
        <label className={label}>
          Availability
          <select value={t.availabilityMode} onChange={(e) => set({ availabilityMode: e.target.value })} className="snap-select rounded-md border border-hairline bg-canvas px-2 py-2 text-sm text-ink outline-none">
            <option value="inherit">Studio hours (+ any type rules)</option>
            <option value="own">Only this type's hours</option>
          </select>
        </label>
        <label className={label}>
          Booking questions
          <select value={t.bookingFormTemplateId ?? ""} onChange={(e) => set({ bookingFormTemplateId: e.target.value || null })} className="snap-select rounded-md border border-hairline bg-canvas px-2 py-2 text-sm text-ink outline-none">
            <option value="">None</option>
            {formTemplates.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className={label}>
        Color
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button key={c} type="button" aria-label={`Color ${c}`} onClick={() => set({ color: c })} className={`h-6 w-6 rounded-full border-2 ${t.color === c ? "border-ink" : "border-transparent"}`} style={{ background: c }} />
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs text-ink-subtle">
        <input type="checkbox" checked={t.active} onChange={(e) => set({ active: e.target.checked })} className="h-4 w-4 accent-[var(--primary)]" />
        Active (bookable)
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="mt-2 flex gap-2">
        <Button onClick={() => onSave(t)} disabled={busy || !t.name.trim()}>{busy ? "Saving…" : "Save"}</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
