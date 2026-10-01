"use client";

/* Lead conversation card (WEB-308) — the lead thread UI retired into the
 * unified Inbox: exactly one reply composer exists in the product. What
 * stays here is the CRM record surface: the conversation deep-link (with a
 * compact recent-message preview), the conversion dialog (WEB-167) and
 * archive/restore. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MessageSquare } from "lucide-react";

import { Button } from "@webcules/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@webcules/ui/components/dialog";

const inputCls =
  "rounded-md border border-hairline bg-canvas px-2.5 py-2 text-sm text-ink placeholder:text-ink-tertiary";

type PreviewMessage = { id: string; direction: string; body: string; createdAt: string };

export function LeadConversation({
  leadId,
  leadName,
  leadEmail,
  leadEventType,
  leadEventDate,
  leadStatus,
  projectId,
  projectTitle,
  threadId,
  recentMessages,
}: {
  leadId: string;
  leadName: string;
  leadEmail: string;
  leadEventType: string | null;
  leadEventDate: string | null;
  leadStatus: string;
  projectId?: string | null;
  projectTitle?: string | null;
  threadId: string | null;
  recentMessages: PreviewMessage[];
}) {
  const router = useRouter();
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

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[12px] border border-hairline bg-surface-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium text-ink">
              <MessageSquare className="h-4 w-4 text-primary" aria-hidden /> Conversation
            </p>
            <p className="mt-1 text-sm text-ink-subtle">
              {threadId
                ? "Reading and replying live in the Inbox — one place for every conversation."
                : "No conversation yet. The inquiry and any replies live in the Inbox."}
            </p>
          </div>
          {threadId && (
            <Button size="sm" asChild>
              <Link href={`/dashboard/inbox?thread=${threadId}`}>Open in Inbox</Link>
            </Button>
          )}
        </div>
        {threadId && recentMessages.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5 border-t border-hairline pt-3">
            {recentMessages.slice(-3).map((m) => (
              <p key={m.id} className="truncate text-xs text-ink-subtle">
                <span className="font-medium text-ink">{m.direction === "out" ? "You" : leadName.split(" ")[0]}:</span>{" "}
                {m.body}
              </p>
            ))}
          </div>
        )}
      </div>

      {!converted ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-hairline bg-surface-1 p-4">
          <div className="flex flex-wrap gap-2">
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
            >
              Convert to project
            </Button>
            <Button
              onClick={() => window.location.assign(`/dashboard/inbox${threadId ? `?thread=${threadId}` : ""}`)}
              disabled={busy}
              size="sm"
              variant="secondary"
            >
              Reply in Inbox
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
