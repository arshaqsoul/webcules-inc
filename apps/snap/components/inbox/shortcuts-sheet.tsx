"use client";

/* Shortcuts sheet (WEB-306) — the `?` overlay. The table IS the keymap
 * contract: keys are implemented in InboxView's handler and every row here
 * must match it exactly. */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@webcules/ui/components/dialog";

const KEYS: Array<[string, string]> = [
  ["j / k", "Move selection down / up"],
  ["Enter", "Open (or close) the selected conversation"],
  ["U", "Toggle read / unread"],
  ["Alt+U", "Mark everything read"],
  ["H", "Snooze the selected item"],
  ["Backspace", "Delete the selected item"],
  ["Shift+Backspace", "Delete everything read"],
  ["F", "Filter the stream"],
  ["⌘K / Ctrl+K", "Command menu"],
  ["Esc", "Close the thread or dialog"],
  ["?", "This sheet"],
];

export function ShortcutsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription asChild>
            <span>The inbox is built to be driven from the keyboard, Linear-style.</span>
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5">
          {KEYS.map(([k, d]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="rounded-md border border-hairline bg-surface-1 px-2 py-1 font-mono text-xs text-ink">{k}</kbd>
              </dt>
              <dd className="self-center text-sm text-ink-subtle">{d}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
