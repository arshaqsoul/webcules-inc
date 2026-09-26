"use client";

/* Lead conversation thread: the original inquiry, outbound replies, inbound
 * client answers (captured by the snap-email worker webhook), plus the reply
 * composer and convert/archive actions. */
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@webcules/ui/components/button";
import { useConfirm } from "@/components/confirm-provider";

type ThreadMessage = {
  id: string;
  direction: string;
  body: string;
  createdAt: string;
};

export function LeadThread({
  leadId,
  leadName,
  leadStatus,
  leadMessage,
  messages,
}: {
  leadId: string;
  leadName: string;
  leadStatus: string;
  leadMessage: string;
  messages: ThreadMessage[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [converted, setConverted] = useState(leadStatus === "converted");

  async function sendReply() {
    if (!reply.trim()) return;
    setBusy(true);
    setStatus(null);
    const res = await fetch(`/api/leads/${leadId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: reply }),
    });
    const body = (await res.json().catch(() => ({}))) as { delivered?: boolean };
    setBusy(false);
    if (res.ok) {
      setReply("");
      setStatus(body.delivered ? "Reply sent." : "Reply recorded, but email delivery failed — check the inquiry inbox.");
      router.refresh();
    } else setStatus("Reply failed — try again.");
  }

  async function convert() {
    if (!(await confirm({ title: "Create project?", body: `Create a project for ${leadName}? They'll be added to your clients.` }))) return;
    setBusy(true);
    const res = await fetch(`/api/leads/${leadId}`, { method: "POST" });
    setBusy(false);
    if (res.ok) {
      setConverted(true);
      setStatus("Converted — project created in Booked.");
      router.refresh();
    } else setStatus("Conversion failed.");
  }

  async function setLeadStatus(next: string) {
    setBusy(true);
    const res = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setBusy(false);
    setStatus(res.ok ? `Moved to ${next}.` : "Update failed.");
    if (res.ok) router.refresh();
  }

  const bubble = (m: ThreadMessage) => (
    <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-[12px] border px-4 py-3 text-sm leading-relaxed ${
          m.direction === "out"
            ? "border-primary/30 bg-primary/10 text-ink"
            : "border-hairline bg-surface-1 text-ink-muted"
        }`}
      >
        <p className="mb-1 text-[11px] uppercase tracking-wide text-ink-tertiary">
          {m.direction === "out" ? "You" : leadName} · {new Date(m.createdAt).toLocaleString()}
        </p>
        <p className="whitespace-pre-wrap">{m.body}</p>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-[12px] border border-hairline bg-surface-1 p-4">
        {leadMessage && <>{bubble({ id: "original", direction: "in", body: leadMessage, createdAt: messages[0]?.createdAt ?? "" })}</>}
        {messages.length > 0 ? (
          messages.map(bubble)
        ) : (
          !leadMessage && <p className="text-sm text-ink-subtle">No message body on this inquiry.</p>
        )}
      </div>

      {!converted ? (
        <div className="rounded-[12px] border border-hairline bg-surface-1 p-4">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={`Reply to ${leadName.split(" ")[0]}…`}
            className="min-h-[96px] w-full resize-vertical rounded-md border border-input bg-background px-3 py-2 text-sm text-ink placeholder:text-ink-tertiary"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button onClick={sendReply} disabled={busy || !reply.trim()} size="sm">
                Send reply
              </Button>
              <Button onClick={convert} disabled={busy} size="sm" variant="secondary">
                Convert to project
              </Button>
            </div>
            {leadStatus !== "archived" ? (
              <Button onClick={() => setLeadStatus("archived")} disabled={busy} size="sm" variant="ghost" className="text-ink-subtle">
                Archive
              </Button>
            ) : (
              <Button onClick={() => setLeadStatus("new")} disabled={busy} size="sm" variant="ghost" className="text-ink-subtle">
                Restore
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-[12px] border border-success/30 bg-success/10 p-4 text-sm text-success-text">
          Converted to a project — track it under Projects.
        </div>
      )}

      {status && <p className="text-sm text-ink-subtle">{status}</p>}
    </div>
  );
}
