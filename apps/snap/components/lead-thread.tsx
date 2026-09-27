"use client";

/* Lead conversation thread: the original inquiry, outbound replies, inbound
 * client answers (captured by the snap-email worker webhook), plus the reply
 * composer, the conversion dialog (WEB-167: title/date/client overrides with
 * a missing-date warning) and archive/restore. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@webcules/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@webcules/ui/components/dialog";

type ThreadMessage = {
  id: string;
  direction: string;
  body: string;
  createdAt: string;
};

const inputCls =
  "rounded-md border border-hairline bg-canvas px-2.5 py-2 text-sm text-ink placeholder:text-ink-tertiary";

export function LeadThread({
  leadId,
  leadName,
  leadEmail,
  leadEventType,
  leadEventDate,
  leadStatus,
  leadMessage,
  projectId,
  projectTitle,
  messages,
}: {
  leadId: string;
  leadName: string;
  leadEmail: string;
  leadEventType: string | null;
  leadEventDate: string | null;
  leadStatus: string;
  leadMessage: string;
  projectId?: string | null;
  projectTitle?: string | null;
  messages: ThreadMessage[];
}) {
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [converted, setConverted] = useState(leadStatus === "converted");

  // Conversion dialog state — prefilled from the lead, overridable in-flight.
  const [convOpen, setConvOpen] = useState(false);
  const [cTitle, setCTitle] = useState("");
  const [cDate, setCDate] = useState(leadEventDate ?? "");
  const [cName, setCName] = useState(leadName);
  const [cEmail, setCEmail] = useState(leadEmail);
  const [convError, setConvError] = useState("");

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
    if (busy) return;
    setBusy(true);
    setConvError("");
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: cTitle.trim() || undefined,
          eventDate: cDate || null,
          clientName: cName.trim(),
          clientEmail: cEmail.trim(),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setConvOpen(false);
        setConverted(true);
        setStatus("Converted — project created in Booked.");
        router.refresh();
        return;
      }
      setConvError(
        body.error === "duplicate_open_lead"
          ? "Another open lead already uses that email — edit that lead instead of merging by email."
          : body.error === "already_converted"
            ? "This lead has already been converted."
            : "Conversion failed — try again.",
      );
    } catch {
      setConvError("Network error — try again.");
    }
    setBusy(false);
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
              <Button
                onClick={() => {
                  setCTitle(`${leadName}${leadEventType ? ` — ${leadEventType}` : ""}`);
                  setCDate(leadEventDate ?? "");
                  setCName(leadName);
                  setCEmail(leadEmail);
                  setConvError("");
                  setConvOpen(true);
                }}
                disabled={busy}
                size="sm"
                variant="secondary"
              >
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
          Converted to a project{projectTitle ? ` — ${projectTitle}` : ""}.{" "}
          {projectId ? (
            <Link href={`/dashboard/projects/${projectId}`} className="font-medium underline underline-offset-2">
              Track it under Projects
            </Link>
          ) : (
            "Track it under Projects."
          )}
        </div>
      )}

      {status && <p className="text-sm text-ink-subtle">{status}</p>}

      <Dialog open={convOpen} onOpenChange={(v) => !busy && setConvOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert to project</DialogTitle>
            <DialogDescription asChild>
              <div className="flex flex-col gap-3 text-sm text-ink-subtle">
                <p>
                  Creates a project in Booked and adds {leadName.split(" ")[0]} to your clients. Adjust anything the
                  inquiry got wrong — the lead is updated to match.
                </p>
                <label className="flex flex-col gap-1">
                  Project title
                  <input value={cTitle} onChange={(e) => setCTitle(e.target.value)} className={inputCls} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    Event date
                    <input type="date" value={cDate} onChange={(e) => setCDate(e.target.value)} className={inputCls} />
                  </label>
                  <label className="flex flex-col gap-1">
                    Client email
                    <input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} className={inputCls} />
                  </label>
                </div>
                <label className="flex flex-col gap-1">
                  Client name
                  <input value={cName} onChange={(e) => setCName(e.target.value)} className={inputCls} />
                </label>
                {!cDate && (
                  <p className="rounded-md bg-amber-500/10 px-3 py-2 text-[13px] text-amber-600 dark:text-amber-400">
                    No event date set — this project won&rsquo;t auto-advance through the pipeline until a date is
                    added. You can set it later on the project.
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          {convError && <p className="text-xs text-destructive">{convError}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setConvOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void convert()}>
              {busy ? "Converting…" : "Create project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
