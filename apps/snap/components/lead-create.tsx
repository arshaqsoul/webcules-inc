"use client";

/* Manual lead entry (WEB-167 stretch) — walk-in / phone enquiries join the
 * same inbox with source "manual". The open-lead merge guard blocks creating
 * a second open thread for an email that already has one. */
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

const inputCls =
  "rounded-md border border-hairline bg-canvas px-2.5 py-2 text-sm text-ink placeholder:text-ink-tertiary";

export function LeadCreate() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", eventType: "", eventDate: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function create() {
    if (busy) return;
    if (!form.name.trim() || !form.email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          eventType: form.eventType.trim(),
          eventDate: form.eventDate || undefined,
          message: form.message.trim(),
        }),
      });
      if (res.ok) {
        setOpen(false);
        setForm({ name: "", email: "", phone: "", eventType: "", eventDate: "", message: "" });
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(
        body.error === "duplicate_open_lead"
          ? "An open lead already exists for that email — open it from the list and edit it instead."
          : "Couldn't create the lead — check the fields and try again.",
      );
    } catch {
      setError("Network error — try again.");
    }
    setBusy(false);
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Add lead
      </Button>

      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add lead</DialogTitle>
            <DialogDescription asChild>
              <div className="flex flex-col gap-3 text-sm text-ink-subtle">
                <p>For walk-in and phone enquiries — lands in the inbox as a new lead.</p>
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
                  Notes
                  <textarea
                    value={form.message}
                    onChange={(e) => set("message", e.target.value)}
                    placeholder="What they asked for, callback wishes…"
                    className={`min-h-[88px] resize-vertical ${inputCls}`}
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
            <Button disabled={busy} onClick={() => void create()}>
              {busy ? "Adding…" : "Add lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
