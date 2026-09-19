"use client";

import { Check, Copy, Mail, MessageCircle, Phone, Reply, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import type { LeadView, ProjectView, TouchView } from "@/components/app/lead-detail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { logOutreach, markOutreach } from "@/app/actions";
import { draftEmail, draftFollowup, draftReply, draftWhatsApp } from "@/lib/outreach";
import { fmtDate } from "@/lib/utils";

const CHANNEL_ICON = { email: Mail, whatsapp: MessageCircle, call: Phone, meeting: Phone, note: Send } as const;

export function OutreachPanel({ lead, project, touches }: { lead: LeadView; project: ProjectView | null; touches: TouchView[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"email" | "reply" | "whatsapp" | "f3" | "f7">("email");
  const [copied, setCopied] = useState(false);

  const ctx = useMemo(
    () => ({
      business: lead.business,
      contactName: lead.contactName,
      industry: lead.industry,
      siteUrl: lead.siteUrl,
      previewUrl: project?.previewUrl ?? null,
      grade: project?.grade ?? null,
      findings: project?.findings ?? null,
      quote: {
        oneTime: project?.quoteOneTime ?? 799,
        maintenanceMonthly: project?.quoteMaintenance ?? 10,
        marketLow: project?.marketLow ?? 2500,
        marketHigh: project?.marketHigh ?? 4500,
      },
    }),
    [lead, project],
  );

  const email = useMemo(() => draftEmail(ctx), [ctx]);
  const reply = useMemo(() => draftReply(ctx), [ctx]);
  const drafts = {
    email: { title: email.subject, body: email.body, label: "Cold email (no links)" },
    reply: { title: reply.subject, body: reply.body, label: "Reply pack (image + link)" },
    whatsapp: { title: "WhatsApp hook", body: draftWhatsApp(ctx), label: "WhatsApp hook" },
    f3: { title: "Day-3 follow-up", body: draftFollowup(ctx, 3), label: "Day-3 follow-up" },
    f7: { title: "Day-7 last nudge", body: draftFollowup(ctx, 7), label: "Day-7 last nudge" },
  };
  const current = drafts[tab];

  async function copy() {
    await navigator.clipboard.writeText(tab === "email" || tab === "reply" ? `Subject: ${current.title}\n\n${current.body}` : current.body);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  }

  function logSent() {
    startTransition(async () => {
      await logOutreach({
        leadId: lead.id,
        channel: tab === "whatsapp" ? "whatsapp" : "email",
        kind: tab === "f3" || tab === "f7" ? "followup" : tab === "reply" ? "reply" : "pitch",
        subject: current.title,
        body: current.body,
        status: "sent",
      });
      toast.success("Logged as sent — follow-up clock started");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Pitch drafts</CardTitle>
          <CardDescription>
            The cold email carries <strong>zero links and zero images</strong> (workers.dev links are spam-blocked; a fresh domain can't afford HTML weight). After
            they reply, send the <strong>Reply pack</strong>: before/after image attached + the live preview link — safe in an engaged thread. WhatsApp carries
            the link immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(drafts) as (keyof typeof drafts)[]).map((k) => (
              <Button key={k} size="sm" variant={tab === k ? "default" : "outline"} onClick={() => setTab(k)}>
                {k === "email" ? <Mail /> : k === "whatsapp" ? <MessageCircle /> : k === "reply" ? <Reply /> : <Send />}
                {drafts[k].label}
              </Button>
            ))}
          </div>

          {(tab === "email" || tab === "reply") && (
            <div className="rounded-md border bg-secondary/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Subject: </span>
              <span className="font-medium">{current.title}</span>
            </div>
          )}
          {tab === "reply" && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Attach <code>research/outreach/before-after.jpg</code> (generate with before_after.py) when you send this — it's the image the cold email promised.
            </div>
          )}
          <Textarea readOnly value={current.body} className="min-h-72 font-mono text-xs leading-5" />

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={copy}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button disabled={pending} onClick={logSent}>
              <Send /> Mark as sent
            </Button>
            {lead.email && tab === "email" && (
              <Button
                variant="ghost"
                onClick={() =>
                  window.open(
                    `mailto:${lead.email}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`,
                    "_blank",
                  )
                }
              >
                <Mail /> Open in mail app
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <LogTouchDialog leadId={lead.id} />
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
            <CardDescription>{touches.length} touches logged</CardDescription>
          </CardHeader>
          <CardContent className="flex max-h-96 flex-col gap-2 overflow-y-auto">
            {touches.length === 0 && <p className="text-sm text-muted-foreground">Nothing yet — the first pitch goes here.</p>}
            {touches.map((t) => {
              const Icon = CHANNEL_ICON[t.channel as keyof typeof CHANNEL_ICON] ?? Send;
              return (
              <div key={t.id} className="rounded-lg border p-2.5">
                <div className="flex items-center gap-2">
                  <Icon className="size-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">{t.channel}</span>
                  <Badge variant={t.status === "replied" ? "success" : t.status === "sent" ? "info" : t.status === "bounced" ? "destructive" : "muted"}>
                    {t.status}
                  </Badge>
                  <span className="ml-auto text-[11px] text-muted-foreground">{fmtDate(t.createdAt)}</span>
                </div>
                {(t.subject || t.body) && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.subject || t.body}</p>
                )}
                {t.status === "sent" && (
                  <div className="mt-1 flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await markOutreach(t.id, "replied");
                        toast.success("Nice — stage moved to Negotiating");
                        router.refresh();
                      })
                    }
                  >
                    They replied
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-destructive"
                    disabled={pending}
                    title="Email bounced — stop sending to this address"
                    onClick={() =>
                      startTransition(async () => {
                        await markOutreach(t.id, "bounced");
                        toast.warning("Marked bounced — switch this lead to WhatsApp or find a new address");
                        router.refresh();
                      })
                    }
                  >
                    Bounced
                  </Button>
                  </div>
                )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LogTouchDialog({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [channel, setChannel] = useState("call");
  const [note, setNote] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Phone /> Log a call / meeting / note
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log a touch</DialogTitle>
          <DialogDescription>Calls, meetings, replies — anything that keeps the timeline honest.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              await logOutreach({
                leadId,
                channel: channel as "call" | "meeting" | "note",
                kind: "note",
                body: note,
                status: "sent",
              });
              toast.success("Logged");
              setOpen(false);
              setNote("");
              router.refresh();
            });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label>Type</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="call">Phone call</SelectItem>
                <SelectItem value="meeting">Meeting</SelectItem>
                <SelectItem value="note">Note</SelectItem>
                <SelectItem value="reply">Email reply (received)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="note">What happened</Label>
            <Textarea id="note" required value={note} onChange={(e) => setNote(e.target.value)} placeholder="Talked to owner, wants to think it over until Friday…" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Log it"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
