"use client";

/* "Connect a client" prompt (WEB-335) - shown instead of ever inventing a
 * recipient. Used by the triage pane (attach an unmatched email to a project
 * that has no client; the sender pre-fills the form) and by the thread composer
 * (a legacy conversation with no client email). */
import { useEffect, useState } from "react";

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

export function ConnectClientDialog({
  open,
  onOpenChange,
  projectTitle,
  initialEmail,
  initialName,
  busy,
  error,
  confirmLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shown in the copy when the client is being connected to a project. */
  projectTitle?: string | null;
  initialEmail?: string;
  initialName?: string;
  busy: boolean;
  error: string | null;
  confirmLabel: string;
  onSubmit: (client: { email: string; name: string }) => void;
}) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [name, setName] = useState(initialName ?? "");

  // Re-seed whenever the prompt is opened for a new suggestion.
  useEffect(() => {
    if (open) {
      setEmail(initialEmail ?? "");
      setName(initialName ?? "");
    }
  }, [open, initialEmail, initialName]);

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect a client{projectTitle ? ` to ${projectTitle}` : ""}</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-col gap-3 text-sm text-ink-subtle">
              <p>
                {projectTitle ? "This project has no client yet. " : "This conversation has no client yet. "}
                Connect one so replies have somewhere to go and the history stays together.
                {initialEmail ? " We filled in the sender of this email." : ""}
              </p>
              <label className="flex flex-col gap-1">
                Client email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="client@example.com"
                  className={inputCls}
                  autoFocus
                />
              </label>
              <label className="flex flex-col gap-1">
                <span>
                  Client name <span className="text-ink-tertiary">(optional)</span>
                </span>
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
              </label>
              {error && <p className="text-[13px] text-destructive">{error}</p>}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || !valid} onClick={() => onSubmit({ email: email.trim(), name: name.trim() })}>
            {busy ? "Connecting…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
