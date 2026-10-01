"use client";

/* ⌘K command menu (WEB-306) — acts on the SELECTED item/thread: snooze
 * presets, read toggles, bulk clears, and deep links to the conversation's
 * lead/project when they exist. */
import { useEffect, useRef, useState } from "react";

import { Button } from "@webcules/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@webcules/ui/components/dialog";
import { SNOOZE_PRESETS } from "@/components/inbox/snooze-dialog";

export type CommandTarget = {
  hasSelection: boolean;
  leadId: string | null;
  projectId: string | null;
};

export function CommandMenu({
  open,
  onOpenChange,
  target,
  onSnooze,
  onToggleRead,
  onMarkAllRead,
  onDeleteRead,
  onCloseThread,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  target: CommandTarget;
  onSnooze: (until: Date) => void;
  onToggleRead: () => void;
  onMarkAllRead: () => void;
  onDeleteRead: () => void;
  onCloseThread: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  type Cmd = { id: string; label: string; hint?: string; run: () => void; disabled?: boolean };
  const cmds: Cmd[] = [
    ...SNOOZE_PRESETS.map((p) => ({
      id: "snooze-" + p.id,
      label: `Snooze: ${p.label}`,
      run: () => {
        onSnooze(p.at());
        onOpenChange(false);
      },
      disabled: !target.hasSelection,
    })),
    {
      id: "toggle-read",
      label: "Mark read / unread",
      hint: "U",
      run: () => {
        onToggleRead();
        onOpenChange(false);
      },
      disabled: !target.hasSelection,
    },
    { id: "mark-all-read", label: "Mark everything read", hint: "Alt+U", run: () => { onMarkAllRead(); onOpenChange(false); } },
    { id: "delete-read", label: "Delete everything read", hint: "⇧⌫", run: () => { onDeleteRead(); onOpenChange(false); } },
    { id: "close-thread", label: "Close the open thread", hint: "Esc", run: () => { onCloseThread(); onOpenChange(false); } },
  ];
  if (target.leadId) {
    cmds.push({
      id: "go-lead",
      label: "Go to the lead",
      run: () => {
        window.location.href = `/dashboard/leads/${target.leadId}`;
      },
    });
  }
  if (target.projectId) {
    cmds.push({
      id: "go-project",
      label: "Go to the project",
      run: () => {
        window.location.href = `/dashboard/projects/${target.projectId}`;
      },
    });
  }

  const q = query.trim().toLowerCase();
  const visible = q ? cmds.filter((c) => c.label.toLowerCase().includes(q)) : cmds;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="sr-only">
          <DialogTitle>Command menu</DialogTitle>
          <DialogDescription>Run an inbox action</DialogDescription>
        </DialogHeader>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a command…"
          aria-label="Command"
          className="w-full rounded-md border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-ink-tertiary"
          onKeyDown={(e) => {
            if (e.key === "Enter" && visible[0] && !visible[0].disabled) visible[0].run();
          }}
        />
        <div className="mt-2 flex max-h-80 flex-col gap-1 overflow-y-auto">
          {visible.length === 0 && <p className="px-2 py-3 text-sm text-ink-subtle">No matching command.</p>}
          {visible.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={c.disabled}
              onClick={c.run}
              className="flex items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm text-ink transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span>{c.label}</span>
              {c.hint && <kbd className="rounded border border-hairline bg-surface-1 px-1.5 py-0.5 font-mono text-[11px] text-ink-tertiary">{c.hint}</kbd>}
            </button>
          ))}
        </div>
        <div className="mt-1 flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
