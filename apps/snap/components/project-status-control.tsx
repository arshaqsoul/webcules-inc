"use client";

/* Project status control (WEB-166) — explicit move UI with reason dialogs:
 * retakes (evaluation→snapping), reschedules (snapping→booked, new date),
 * cancellations (reason mandatory, destructive styling). Mirrors the server
 * map so illegal moves are never offered. */
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

const RULES: Record<string, { to: string; label: string; reason?: boolean; newDate?: boolean; destructive?: boolean }[]> = {
  booked: [
    { to: "snapping", label: "Start editing" },
    { to: "closed", label: "Close" },
    { to: "canceled", label: "Cancel project", reason: true, destructive: true },
  ],
  snapping: [
    { to: "evaluation", label: "Ready for review" },
    { to: "closed", label: "Close" },
    { to: "booked", label: "Reschedule…", reason: true, newDate: true },
    { to: "canceled", label: "Cancel project", reason: true, destructive: true },
  ],
  evaluation: [
    { to: "complete", label: "Mark delivered" },
    { to: "closed", label: "Close" },
    { to: "snapping", label: "Retake / reshoot…", reason: true },
    { to: "canceled", label: "Cancel project", reason: true, destructive: true },
  ],
  complete: [
    { to: "closed", label: "Close" },
    { to: "canceled", label: "Cancel project", reason: true, destructive: true },
  ],
  closed: [],
  canceled: [],
};

const STATUS_LABEL: Record<string, string> = {
  booked: "Booked",
  snapping: "In editing",
  evaluation: "In review",
  complete: "Delivered",
  closed: "Closed",
  canceled: "Canceled",
};

export function ProjectStatusControl({ projectId, status }: { projectId: string; status: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rule, setRule] = useState<(typeof RULES)[string][number] | null>(null);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const moves = RULES[status] ?? [];

  async function submit() {
    if (!rule || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toStatus: rule.to,
          note: reason || undefined,
          newEventDate: rule.newDate && date ? new Date(`${date}T12:00:00Z`).toISOString() : undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(
          body.error === "new_event_date_required"
            ? "Pick the new event date."
            : body.error === "reason_required"
              ? "A reason is required for this move."
              : "Move failed — try again.",
        );
        return;
      }
      setOpen(false);
      setRule(null);
      setReason("");
      setDate("");
      router.refresh();
    } catch {
      setError("Network error — try again.");
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {moves.map((m) => (
        <Button
          key={m.to + m.label}
          size="sm"
          variant={m.destructive ? "outline" : "secondary"}
          className={m.destructive ? "text-destructive hover:text-destructive" : undefined}
          disabled={!m.reason && moves.length === 0}
          onClick={() => {
            if (m.reason || m.newDate) {
              setRule(m);
              setOpen(true);
            } else {
              void (async () => {
                setBusy(true);
                await fetch(`/api/projects/${projectId}/transition`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ toStatus: m.to }),
                });
                setBusy(false);
                router.refresh();
              })();
            }
          }}
        >
          {m.label}
        </Button>
      ))}
      {moves.length === 0 && <span className="text-xs text-ink-tertiary">Terminal — {STATUS_LABEL[status] ?? status}</span>}

      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{rule?.label.replace("…", "")}</DialogTitle>
            <DialogDescription asChild>
              <div className="flex flex-col gap-3 text-sm text-ink-subtle">
                {rule?.to === "canceled" && (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-destructive">
                    Cancelling stops pipeline automation. Galleries stay live until they expire — revoke them separately
                    if the client should lose access.
                  </p>
                )}
                {rule?.to === "booked" && <p>The project returns to Booked and auto-advances when the new date arrives.</p>}
                {rule?.to === "snapping" && <p>The project returns to editing for a retake or reshoot.</p>}
                {rule?.reason && (
                  <label className="flex flex-col gap-1">
                    Reason
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={rule.to === "booked" ? "Client moved the date" : rule.to === "snapping" ? "Reshoot of family formals" : "Client pulled out"}
                      className="rounded-md border border-hairline bg-canvas px-2.5 py-2 text-sm text-ink"
                    />
                  </label>
                )}
                {rule?.newDate && (
                  <label className="flex flex-col gap-1">
                    New event date
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="rounded-md border border-hairline bg-canvas px-2.5 py-2 text-sm text-ink"
                    />
                  </label>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant={rule?.destructive ? "destructive" : "default"} disabled={busy} onClick={() => void submit()}>
              {busy ? "Moving…" : `Move to ${rule ? (STATUS_LABEL[rule.to] ?? rule.to) : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
