"use client";

import { ChevronRight, Globe, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { EditLeadDialog } from "@/components/app/edit-lead-dialog";
import { OutreachPanel } from "@/components/app/outreach-panel";
import { PaymentsPanel } from "@/components/app/payments-panel";
import { ProjectPanel } from "@/components/app/project-panel";
import { StageBadge } from "@/components/app/stage-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { setStage } from "@/app/actions";
import type { Stage } from "@/db/schema";
import type { Finding } from "@/lib/forge";
import { draftEmail, draftWhatsApp } from "@/lib/outreach";
import { STAGES, nextStage } from "@/lib/pipeline";
import { fmtDate, whatsappDeepLink } from "@/lib/utils";

export type LeadView = {
  id: string;
  business: string;
  industry: string;
  city: string;
  siteUrl: string;
  contactName: string;
  email: string;
  phone: string;
  stage: Stage;
  notes: string;
  lastTouchAt: number | null;
};

export type ProjectView = {
  id: string;
  slug: string;
  previewUrl: string;
  repoUrl: string;
  pages: number;
  tier: string;
  quoteOneTime: number;
  quoteMaintenance: number;
  marketLow: number;
  marketHigh: number;
  grade: { uiux: string; conversion: string; ai: string };
  findings: Finding[];
};

export type TouchView = {
  id: string;
  channel: string;
  kind: string;
  subject: string;
  body: string;
  status: string;
  createdAt: number;
};

export type PayView = {
  id: string;
  kind: string;
  method: string;
  amountCents: number;
  status: string;
  note: string;
  createdAt: number;
};

export function LeadDetail({
  lead,
  project,
  touches,
  pays,
  subscription,
  stripeOn,
}: {
  lead: LeadView;
  project: ProjectView | null;
  touches: TouchView[];
  pays: PayView[];
  subscription: { id: string; status: string; priceMonthlyCents: number } | null;
  stripeOn: boolean;
}) {
  const router = useRouter();
  const [stage, setLeadStage] = useState<Stage>(lead.stage);
  const [, startTransition] = useTransition();
  const next = nextStage(stage);

  // pitch drafts for the one-click send buttons (same generators as the Outreach tab)
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
  const emailDraft = useMemo(() => draftEmail(ctx), [ctx]);
  const waDraft = useMemo(() => draftWhatsApp(ctx), [ctx]);
  const emailHref = lead.email
    ? `mailto:${lead.email}?subject=${encodeURIComponent(emailDraft.subject)}&body=${encodeURIComponent(emailDraft.body)}`
    : null;
  const waHref = whatsappDeepLink(lead.phone, waDraft);

  function move(s: Stage) {
    setLeadStage(s);
    startTransition(async () => {
      await setStage(lead.id, s);
      toast.success(`Stage → ${STAGES.find((x) => x.id === s)?.label}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/leads" className="hover:text-foreground">
            Leads
          </Link>
          <ChevronRight className="size-3.5" />
          <span className="text-foreground">{lead.business}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{lead.business}</h1>
            <StageBadge stage={stage} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {emailHref ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(emailHref)}
                title={`${lead.email} — opens your default mail app (set Zoho Mail as the Windows mailto handler and this opens Zoho compose with everything prefilled)`}
              >
                <Mail /> Email pitch
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">no email on file</span>
            )}
            {waHref ? (
              <Button
                size="sm"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => window.open(waHref)}
                title={`${lead.phone} — opens WhatsApp desktop with the message typed (first time: allow the "open WhatsApp" prompt)`}
              >
                <MessageCircle /> WhatsApp pitch
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">no mobile on file</span>
            )}
            {next && (
              <Button variant={next === "lost" ? "outline" : "default"} size="sm" onClick={() => move(next)}>
                Advance to {STAGES.find((s) => s.id === next)?.label}
                <ChevronRight />
              </Button>
            )}
            <EditLeadDialog lead={lead} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
          {lead.industry && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5" /> {lead.industry} · {lead.city}
            </span>
          )}
          {lead.siteUrl && (
            <a href={lead.siteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-primary">
              <Globe className="size-3.5" /> {lead.siteUrl.replace(/^https?:\/\/(www\.)?/, "")}
            </a>
          )}
          {lead.email && (
            <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1.5 hover:text-primary">
              <Mail className="size-3.5" /> {lead.email}
            </a>
          )}
          {lead.phone && (
            <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1.5 hover:text-primary">
              <Phone className="size-3.5" /> {lead.phone}
            </a>
          )}
          <span>last touch {lead.lastTouchAt ? fmtDate(lead.lastTouchAt) : "never"}</span>
        </div>
      </div>

      {/* stage stepper */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-xl border bg-card p-2">
        {STAGES.filter((s) => s.id !== "lost").map((s, i, arr) => {
          const currentIdx = arr.findIndex((x) => x.id === stage);
          const done = currentIdx >= 0 && i < currentIdx;
          const active = stage === s.id;
          return (
            <button
              key={s.id}
              onClick={() => move(s.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                active ? "bg-primary text-primary-foreground" : done ? "text-primary" : "text-muted-foreground hover:bg-secondary"
              }`}
              title={s.hint}
            >
              {done && "✓"} {s.label}
            </button>
          );
        })}
        {stage === "lost" && <Badge variant="muted" className="mx-2">Lost / parked</Badge>}
      </div>

      <Tabs defaultValue="project">
        <TabsList>
          <TabsTrigger value="project">Project & quote</TabsTrigger>
          <TabsTrigger value="outreach" className="gap-1.5">
            <MessageCircle className="size-3.5" /> Outreach
          </TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="project">
          <ProjectPanel siteUrl={lead.siteUrl} project={project} />
        </TabsContent>
        <TabsContent value="outreach">
          <OutreachPanel lead={lead} project={project} touches={touches} />
        </TabsContent>
        <TabsContent value="payments">
          <PaymentsPanel lead={lead} project={project} pays={pays} subscription={subscription} stripeOn={stripeOn} />
        </TabsContent>
      </Tabs>

      {lead.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{lead.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
