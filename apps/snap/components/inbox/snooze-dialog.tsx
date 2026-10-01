"use client";

/* Snooze dialog (WEB-306) — Linear's model: pick a reason, the item hides
 * until the moment passes, then resurfaces unread. Opened by the H key, the
 * row button, or the command menu. */
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

export const SNOOZE_PRESETS: Array<{ id: string; label: string; at: () => Date }> = [
  {
    id: "later-today",
    label: "Later today (6 PM)",
    at: () => {
      const d = new Date();
      d.setHours(18, 0, 0, 0);
      if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1); // past 6 PM → tomorrow 9 AM
      return d;
    },
  },
  {
    id: "tomorrow",
    label: "Tomorrow (9 AM)",
    at: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
  {
    id: "next-week",
    label: "Next week (Mon 9 AM)",
    at: () => {
      const d = new Date();
      d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); // next Monday
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
];

export function SnoozeDialog({
  open,
  onOpenChange,
  onSnooze,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSnooze: (until: Date) => void;
}) {
  const [custom, setCustom] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Snooze</DialogTitle>
          <DialogDescription asChild>
            <span>Hides this item until the moment passes — then it resurfaces unread.</span>
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          {SNOOZE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onSnooze(p.at());
                onOpenChange(false);
              }}
              className="rounded-md border border-hairline bg-surface-1 px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-surface-2"
            >
              {p.label}
            </button>
          ))}
          <div className="mt-1 flex items-center gap-2">
            <input
              type="datetime-local"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              aria-label="Custom date and time"
              className="flex-1 rounded-md border border-hairline bg-canvas px-2.5 py-2 text-sm text-ink"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={!custom}
              onClick={() => {
                const d = new Date(custom);
                if (!Number.isNaN(d.getTime())) {
                  onSnooze(d);
                  onOpenChange(false);
                }
              }}
            >
              Snooze until
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
