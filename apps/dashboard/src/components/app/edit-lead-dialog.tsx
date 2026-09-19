"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { LeadView } from "@/components/app/lead-detail";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateLead } from "@/app/actions";

export function EditLeadDialog({ lead, compact }: { lead: LeadView; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    business: lead.business,
    industry: lead.industry,
    siteUrl: lead.siteUrl,
    contactName: lead.contactName,
    email: lead.email,
    phone: lead.phone,
    notes: lead.notes,
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {compact ? (
          <Button variant="ghost" size="icon" className="size-8" title="Edit lead">
            <Pencil />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Pencil /> Edit
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit lead</DialogTitle>
          <DialogDescription>Found their email or mobile after all? Fill it in — the send buttons appear the moment a contact lands.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              await updateLead(lead.id, form);
              toast.success("Lead updated");
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="e-business">Business name</Label>
            <Input id="e-business" required value={form.business} onChange={set("business")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="e-contactName">Contact name</Label>
            <Input id="e-contactName" value={form.contactName} onChange={set("contactName")} placeholder="Owner / manager" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="e-industry">Industry</Label>
            <Input id="e-industry" value={form.industry} onChange={set("industry")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="e-email">Email</Label>
            <Input id="e-email" type="email" value={form.email} onChange={set("email")} placeholder="owner@business.ca" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="e-phone">Phone / WhatsApp</Label>
            <Input id="e-phone" value={form.phone} onChange={set("phone")} placeholder="+1 306 …" />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="e-siteUrl">Website</Label>
            <Input id="e-siteUrl" type="url" value={form.siteUrl} onChange={set("siteUrl")} />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="e-notes">Notes</Label>
            <Textarea id="e-notes" value={form.notes} onChange={set("notes")} />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
