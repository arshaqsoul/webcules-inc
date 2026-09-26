"use client";

/* Project hub → Contracts (WEB-158): template editor with merge-field
 * insert buttons, send for signature, void. Merge fields fill from the
 * project/client at send time and freeze into the stored body. */
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@webcules/ui/components/button";
import { useConfirm } from "@/components/confirm-provider";

export type ContractItem = {
  id: string;
  title: string;
  status: string;
  clientEmail: string | null;
  sentAt: string | null;
  signedAt: string | null;
  signerName: string | null;
  hasPdf: boolean;
};

const STATUS_TONE: Record<string, string> = {
  draft: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  sent: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  signed: "bg-success/10 text-success-text",
  void: "bg-surface-2 text-ink-subtle",
};

const MERGE_FIELDS = ["client_name", "studio_name", "date", "event_date", "package"] as const;

const STARTER = `This agreement is between {{studio_name}} and {{client_name}} for {{package}} on {{event_date}}.

1. Session & delivery
{{studio_name}} will photograph the event and deliver a private online gallery.

2. Payment
The package total is due as agreed in the project quote.

3. Copyright
Photos remain the copyright of {{studio_name}}; {{client_name}} receives personal-use rights.

Signed on {{date}}.`;

export function ProjectContracts({
  projectId,
  contracts,
  clientEmail,
}: {
  projectId: string;
  contracts: ContractItem[];
  clientEmail: string | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [title, setTitle] = useState("Photography agreement");
  const [body, setBody] = useState(STARTER);
  const [email, setEmail] = useState(clientEmail ?? "");

  function insertField(field: (typeof MERGE_FIELDS)[number]) {
    setBody((b) => `${b}{{${field}}}`);
  }

  async function create() {
    setBusy("create");
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/contracts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, clientEmail: email || null }),
      });
      if (!res.ok) throw new Error();
      setShowEditor(false);
      setNotice("Draft saved — review it, then send for signature.");
      router.refresh();
    } catch {
      setError("Title needs 2+ chars and the body 20+.");
    }
    setBusy(null);
  }

  async function act(contractId: string, action: "send" | "void") {
    if (action === "void" && !(await confirm({ title: "Void contract?", body: "The signing link stops working.", destructive: true }))) return;
    setBusy(contractId + action);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/projects/${projectId}/contracts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractId, action }),
      });
      const r = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(
          r.error === "no_recipient"
            ? "Add the client's email in the editor first."
            : r.error === "signed"
              ? "Signed contracts can't be changed."
              : "Action failed — try again.",
        );
      } else {
        setNotice(action === "send" ? "Sent — the client got their signing link by email." : "Contract voided.");
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
        <p className="text-xs text-ink-subtle">Merge fields fill at send time and freeze into the contract.</p>
        <Button size="sm" variant="secondary" onClick={() => setShowEditor((v) => !v)}>
          New contract
        </Button>
      </div>

      {showEditor && (
        <div className="flex flex-col gap-2 rounded-[12px] border border-hairline bg-surface-1 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Contract title"
              className="min-w-48 flex-1 rounded-md border border-hairline bg-canvas px-2 py-1.5 text-sm text-ink"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Client email"
              type="email"
              className="w-52 rounded-md border border-hairline bg-canvas px-2 py-1.5 text-sm text-ink"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-ink-tertiary">Insert:</span>
            {MERGE_FIELDS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => insertField(f)}
                className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-ink-subtle hover:text-ink"
              >
                {`{{${f}}}`}
              </button>
            ))}
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className="w-full resize-y rounded-md border border-hairline bg-canvas px-2.5 py-2 font-mono text-xs leading-relaxed text-ink"
          />
          <div className="flex justify-end">
            <Button size="sm" disabled={busy === "create"} onClick={() => void create()}>
              {busy === "create" ? "Saving…" : "Save draft"}
            </Button>
          </div>
        </div>
      )}

      {notice && <p className="text-xs text-success-text">{notice}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}

      {contracts.length === 0 && <p className="text-sm text-ink-subtle">No contracts for this project yet.</p>}
      {contracts.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-[12px] border border-hairline bg-surface-1 px-4 py-3 text-sm">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[c.status] ?? ""}`}>{c.status}</span>
          <span className="min-w-0 flex-1 truncate text-ink">{c.title}</span>
          {c.signerName && <span className="text-xs text-ink-tertiary">by {c.signerName}</span>}
          {c.signedAt && (
            <span className="text-xs text-ink-tertiary">{new Date(c.signedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
          )}
          {c.hasPdf && (
            <a href={`/api/contracts/${c.id}/pdf`} className="text-xs underline underline-offset-2" target="_blank" rel="noreferrer">
              PDF
            </a>
          )}
          <span className="ml-auto flex gap-2">
            {c.status === "draft" && (
              <Button size="sm" disabled={busy === c.id + "send"} onClick={() => void act(c.id, "send")}>
                {busy === c.id + "send" ? "Sending…" : "Send for signature"}
              </Button>
            )}
            {(c.status === "draft" || c.status === "sent") && (
              <Button size="sm" variant="ghost" disabled={busy === c.id + "void"} onClick={() => void act(c.id, "void")}>
                Void
              </Button>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
