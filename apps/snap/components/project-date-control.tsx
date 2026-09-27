"use client";

/* "Add event date" control for undated projects (WEB-167) — a project
 * converted from a lead without a date can't auto-advance until dated. */
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

export function ProjectDateControl({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (busy || !date) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/event-date`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventDate: date }),
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
        return;
      }
      setError("Couldn't set the date — try again.");
    } catch {
      setError("Network error — try again.");
    }
    setBusy(false);
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Add event date
      </Button>

      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add event date</DialogTitle>
            <DialogDescription asChild>
              <div className="flex flex-col gap-3 text-sm text-ink-subtle">
                <p>
                  This project has no event date, so pipeline automation is holding still. Set the date and it starts
                  advancing normally.
                </p>
                <label className="flex flex-col gap-1">
                  Event date
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="rounded-md border border-hairline bg-canvas px-2.5 py-2 text-sm text-ink"
                  />
                </label>
              </div>
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || !date} onClick={() => void save()}>
              {busy ? "Saving…" : "Set date"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
