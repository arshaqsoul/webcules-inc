"use client";

/* Project hub → Invoices (WEB-137): compose from the quote, send (generates
 * + archives the branded PDF and emails the secure link), mark paid / void. */
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@webcules/ui/components/button";
import { useConfirm } from "@/components/confirm-provider";

export type InvoiceItem = {
  id: string;
  number: string;
  status: string;
  totalMinor: number;
  currency: string;
  clientEmail: string | null;
  issuedAt: string | null;
  dueAt: string | null;
  hasPdf: boolean;
};

const STATUS_TONE: Record<string, string> = {
  draft: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  sent: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  paid: "bg-success/10 text-success-text",
  void: "bg-surface-2 text-ink-subtle",
};

function money(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amountMinor / 100);
}

export function ProjectInvoices({
  projectId,
  invoices,
  clientEmail,
  quotedTotalMinor,
  presets,
  currency = "usd",
}: {
  projectId: string;
  invoices: InvoiceItem[];
  clientEmail: string | null;
  quotedTotalMinor: number | null;
  presets: Array<{ id: string; name: string; lines: Array<{ description: string; qty: number; amountMinor: number }> }>;
  /** Studio payment currency (lowercase ISO) for new invoices. */
  currency?: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showCompose, setShowCompose] = useState(false);
  const [desc, setDesc] = useState("Photography package");
  const [amount, setAmount] = useState(quotedTotalMinor !== null ? String(quotedTotalMinor / 100) : "");
  const [email, setEmail] = useState(clientEmail ?? "");
  // Sensible default: net-14 (UTC date — day precision is what matters here).
  const [due, setDue] = useState(() => new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10));
  // WEB-252: an applied package preset overrides the single-line composer.
  const [preset, setPreset] = useState<{ name: string; lines: Array<{ description: string; qty: number; amountMinor: number }> } | null>(null);

  async function create() {
    setBusy("create");
    setError("");
    try {
      const minor = Math.round(Number(amount) * 100);
      if (!preset && (!Number.isFinite(minor) || minor <= 0)) throw new Error();
      if (due && new Date(due).getTime() < new Date().setUTCHours(0, 0, 0, 0)) {
        setError("Due date can't be in the past.");
        return;
      }
      const res = await fetch(`/api/projects/${projectId}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: preset ? preset.lines : [{ description: desc, qty: 1, amountMinor: minor }],
          dueAt: due ? new Date(due).toISOString() : null,
          clientEmail: email || null,
        }),
      });
      if (!res.ok) throw new Error();
      setShowCompose(false);
      setNotice("Draft created — review it, then send.");
      router.refresh();
    } catch {
      setError("Enter a valid amount and recipient.");
    }
    setBusy(null);
  }

  async function act(id: string, action: "send" | "paid" | "void") {
    if (action !== "send" && !(await confirm({ title: `Mark ${action}?`, body: `Mark this invoice ${action}?` }))) return;
    setBusy(id + action);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/invoices/${id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(
          body.error === "no_recipient"
            ? "Add the client's email first (create a new invoice with a recipient)."
            : body.error === "due_in_past"
              ? "The due date is in the past — void this draft and create one with a later due date (or mark it paid if it's settled)."
              : body.error === "email_failed"
                ? "PDF archived but the email failed — check the address and resend."
                : "Action failed — try again.",
        );
      } else {
        setNotice(action === "send" ? "Invoice sent — the client got their secure link." : `Invoice marked ${action}.`);
        router.refresh();
      }
    } catch {
      setError("Network error — try again.");
    }
    setBusy(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-subtle">Numbered per studio. Sending archives a branded PDF and emails a secure link.</p>
        <Button size="sm" variant="secondary" onClick={() => setShowCompose((v) => !v)}>
          New invoice
        </Button>
      </div>

      {showCompose && (
        <div className="flex flex-col gap-2 rounded-[12px] border border-hairline bg-surface-1 px-4 py-3">
          {presets.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="snap-select rounded-md border border-hairline bg-canvas px-2 py-1.5 text-xs text-ink-muted outline-none"
                value=""
                onChange={(e) => {
                  const p = presets.find((x) => x.id === e.target.value);
                  setPreset(p ? { name: p.name, lines: p.lines } : null);
                }}
                aria-label="Apply a package preset"
              >
                <option value="">Apply a package preset…</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {preset && (
                <>
                  <span className="text-xs text-ink-subtle">
                    {preset.name} · {money(preset.lines.reduce((n, l) => n + l.amountMinor * l.qty, 0), currency)}
                  </span>
                  <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setPreset(null)}>Clear</button>
                </>
              )}
            </div>
          )}
          {preset && (
            <ul className="flex flex-col gap-1 rounded-md border border-hairline bg-canvas px-3 py-2 text-xs text-ink">
              {preset.lines.map((l, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>{l.description} ×{l.qty}</span>
                  <span className="text-ink-subtle">{money(l.amountMinor * l.qty, currency)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Description"
              className="min-w-40 flex-1 rounded-md border border-hairline bg-canvas px-2 py-1.5 text-sm text-ink"
            />
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
              inputMode="decimal"
              className="w-24 rounded-md border border-hairline bg-canvas px-2 py-1.5 text-sm text-ink"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Client email"
              type="email"
              className="min-w-40 flex-1 rounded-md border border-hairline bg-canvas px-2 py-1.5 text-sm text-ink"
            />
            <input
              value={due}
              onChange={(e) => setDue(e.target.value)}
              type="date"
              className="rounded-md border border-hairline bg-canvas px-2 py-1.5 text-sm text-ink"
            />
            <Button size="sm" disabled={busy === "create"} onClick={() => void create()}>
              {busy === "create" ? "Creating…" : "Create draft"}
            </Button>
          </div>
        </div>
      )}

      {notice && <p className="text-xs text-success-text">{notice}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}

      {invoices.length === 0 && <p className="text-sm text-ink-subtle">No invoices for this project yet.</p>}
      {invoices.map((inv) => (
        <div key={inv.id} className="flex flex-wrap items-center gap-3 rounded-[12px] border border-hairline bg-surface-1 px-4 py-3 text-sm">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[inv.status] ?? ""}`}>{inv.status}</span>
          <span className="font-mono text-xs text-ink-subtle">{inv.number}</span>
          <span className="font-medium text-ink">{money(inv.totalMinor, inv.currency)}</span>
          {inv.clientEmail && <span className="max-w-48 truncate text-xs text-ink-tertiary">{inv.clientEmail}</span>}
          {inv.dueAt && <span className="text-xs text-ink-tertiary">due {new Date(inv.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
          <span className="ml-auto flex gap-2">
            {inv.status === "draft" && (
              <Button size="sm" disabled={busy === inv.id + "send"} onClick={() => void act(inv.id, "send")}>
                {busy === inv.id + "send" ? "Sending…" : "Send"}
              </Button>
            )}
            {inv.status === "sent" && (
              <Button size="sm" variant="outline" disabled={busy === inv.id + "paid"} onClick={() => void act(inv.id, "paid")}>
                Mark paid
              </Button>
            )}
            {(inv.status === "draft" || inv.status === "sent") && (
              <Button size="sm" variant="ghost" disabled={busy === inv.id + "void"} onClick={() => void act(inv.id, "void")}>
                Void
              </Button>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
