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
}: {
  projectId: string;
  invoices: InvoiceItem[];
  clientEmail: string | null;
  quotedTotalMinor: number | null;
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
  const [due, setDue] = useState("");

  async function create() {
    setBusy("create");
    setError("");
    try {
      const minor = Math.round(Number(amount) * 100);
      if (!Number.isFinite(minor) || minor <= 0) throw new Error();
      const res = await fetch(`/api/projects/${projectId}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: [{ description: desc, qty: 1, amountMinor: minor }],
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
