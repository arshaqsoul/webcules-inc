"use client";

/* Lead edit dialog (WEB-167) — every captured field is editable before and
 * after conversion; each save is audited server-side. The open-lead merge
 * guard surfaces here when the new email already owns an open thread. */
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

type LeadFields = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  eventType: string | null;
  eventDate: string | null;
  message: string | null;
};

const inputCls =
  "rounded-md border border-hairline bg-canvas px-2.5 py-2 text-sm text-ink placeholder:text-ink-tertiary";

export function LeadEdit({ lead }: { lead: LeadFields }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: lead.name,
    email: lead.email,
    phone: lead.phone ?? "",
    eventType: lead.eventType ?? "",
    eventDate: lead.eventDate ?? "",
    message: lead.message ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (busy) return;
    if (!form.name.trim() || !form.email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          eventType: form.eventType.trim(),
          eventDate: form.eventDate || null,
          message: form.message,
        }),
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(
        body.error === "duplicate_open_lead"
          ? "Another open lead already uses that email — edit that lead instead of merging by email."
          : body.error === "not_found"
            ? "This lead no longer exists."
            : "Couldn't save — check the fields and try again.",
      );
    } catch {
      setError("Network error — try again.");
    }
    setBusy(false);
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Edit details
      </Button>

      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit lead</DialogTitle>
            <DialogDescription asChild>
              <div className="flex flex-col gap-3 text-sm text-ink-subtle">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    Name
                    <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls} />
                  </label>
                  <label className="flex flex-col gap-1">
                    Email
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => set("email", e.target.value)}
                      className={inputCls}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Phone
                    <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} />
                  </label>
                  <label className="flex flex-col gap-1">
                    Shoot type
                    <input
                      value={form.eventType}
                      onChange={(e) => set("eventType", e.target.value)}
                      placeholder="Wedding, portrait…"
                      className={inputCls}
                    />
                  </label>
                  <label className="flex flex-col gap-1 sm:col-span-2">
                    Event date
                    <input
                      type="date"
                      value={form.eventDate}
                      onChange={(e) => set("eventDate", e.target.value)}
                      className={inputCls}
                    />
                  </label>
                </div>
                <label className="flex flex-col gap-1">
                  Message
                  <textarea
                    value={form.message}
                    onChange={(e) => set("message", e.target.value)}
                    className={`min-h-[88px] resize-vertical ${inputCls}`}
                  />
                </label>
                {form.email.trim().toLowerCase() !== lead.email && (
                  <p className="rounded-md bg-amber-500/10 px-3 py-2 text-[13px] text-amber-600 dark:text-amber-400">
                    Changing the email re-keys future replies — mail from the old address may not thread here anymore.
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
