"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createLead } from "@/app/actions";

export function LeadFormDialog({
  trigger,
  open,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ business: "", industry: "", siteUrl: "", contactName: "", email: "", phone: "", notes: "" });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await createLead(form);
        toast.success(`${form.business} added`);
        setForm({ business: "", industry: "", siteUrl: "", contactName: "", email: "", phone: "", notes: "" });
        onOpenChange?.(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not add lead");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New lead</DialogTitle>
          <DialogDescription>A Saskatoon business worth upgrading. Everything except the name is optional — fill the rest after research.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="business">Business name *</Label>
            <Input id="business" required value={form.business} onChange={set("business")} placeholder="Riverside Dental" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="industry">Industry</Label>
            <Input id="industry" value={form.industry} onChange={set("industry")} placeholder="dental clinic" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="siteUrl">Current website</Label>
            <Input id="siteUrl" type="url" value={form.siteUrl} onChange={set("siteUrl")} placeholder="https://…" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="contactName">Contact name</Label>
            <Input id="contactName" value={form.contactName} onChange={set("contactName")} placeholder="Owner / manager" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={form.email} onChange={set("email")} placeholder="owner@business.ca" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="phone">Phone / WhatsApp</Label>
            <Input id="phone" value={form.phone} onChange={set("phone")} placeholder="+1 306 …" />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={form.notes} onChange={set("notes")} placeholder="Weak-site signals, review count, who to ask for…" />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
