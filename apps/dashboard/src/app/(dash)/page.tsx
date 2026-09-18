import { ArrowRight, Bell, Rocket, TrendingUp, Users, Wallet } from "lucide-react";
import Link from "next/link";

import { StatCard } from "@/components/app/stat-card";
import { StageBadge } from "@/components/app/stage-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { STAGES } from "@/lib/pipeline";
import { getOverviewStats } from "@/lib/data";
import { cad, daysSince, fmtDate } from "@/lib/utils";

export default async function OverviewPage() {
  const stats = await getOverviewStats();
  const readyToPitch = stats.byStage.get("redesigned")?.length ?? 0;
  const contacted = stats.byStage.get("contacted")?.length ?? 0;
  const won = (stats.byStage.get("won")?.length ?? 0) + (stats.byStage.get("live")?.length ?? 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Good hunting, Arshaq</h1>
          <p className="text-sm text-muted-foreground">Saskatoon pipeline — {stats.all.length} businesses tracked</p>
        </div>
        <Button asChild>
          <Link href="/leads">
            <Users /> Add a lead
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Rocket} label="Ready to pitch" value={String(readyToPitch)} hint="redesigns waiting on outreach" accent />
        <StatCard icon={Bell} label="Follow-ups due" value={String(stats.followUps.length)} hint="pitched 3+ days, no reply" />
        <StatCard icon={TrendingUp} label="Pipeline value" value={cad(stats.pipelineValue)} hint="redesigned + contacted + negotiating" />
        <StatCard icon={Wallet} label="Maintenance MRR" value={`${cad(stats.mrr)}/mo`} hint={`${stats.activeSubCount} active plans · ${cad(stats.revenueAll)} collected all-time`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Pipeline</CardTitle>
            <CardDescription>Where every Saskatoon business sits right now</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {STAGES.filter((s) => s.id !== "lost").map((stage) => {
                const rows = stats.byStage.get(stage.id) ?? [];
                return (
                  <Link
                    key={stage.id}
                    href={`/pipeline#${stage.id}`}
                    className="group rounded-lg border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-accent/40"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`size-2 rounded-full ${stage.color}`} />
                      <span className="text-xs font-medium text-muted-foreground">{stage.label}</span>
                    </div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums">{rows.length}</div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground group-hover:text-accent-foreground">{rows[0]?.lead.business ?? stage.hint}</div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Follow-ups due</CardTitle>
            <CardDescription>Day-3 nudges for silent pitches</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {stats.followUps.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing waiting. Either pitch more or enjoy the quiet.</p>
            ) : (
              stats.followUps.slice(0, 5).map(({ lead }) => {
                const days = daysSince(lead.lastTouchAt);
                return (
                  <Link key={lead.id} href={`/leads/${lead.id}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-secondary">
                    <span className="truncate font-medium">{lead.business}</span>
                    <Badge variant={days !== null && days >= 7 ? "warning" : "info"}>{days === null ? "never" : `${days}d silent`}</Badge>
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent payments</CardTitle>
            <CardDescription>{won} won deals all-time</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.recentPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments yet — the first Stripe link or e-Transfer lands here.</p>
            ) : (
              <div className="flex flex-col divide-y">
                {stats.recentPayments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant={p.method === "stripe" ? "info" : "muted"}>{p.method === "etransfer" ? "e-Transfer" : p.method}</Badge>
                      <span className="text-muted-foreground">{p.kind === "one_time" ? "website" : p.kind === "maintenance" ? "maintenance" : p.note || "other"}</span>
                    </div>
                    <span className="font-medium tabular-nums">{cad(p.amountCents, { cents: true })}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>The loop</CardTitle>
            <CardDescription>How a business becomes revenue</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {[
              { step: "1", text: "Spot a weak Saskatoon site → log it as a lead here", href: "/leads" },
              { step: "2", text: "Run /forge-redesign <url> — audit, rebuild, quote, preview URL", href: "/forge" },
              { step: "3", text: "/forge-outreach <slug> writes the pitch → send it, log it", href: "/pipeline" },
              { step: "4", text: "Get paid (upfront, or installments — Stripe link / e-Transfer), switch the domain, start $10/mo", href: "/payments" },
            ].map((s) => (
              <Link key={s.step} href={s.href} className="group flex items-center gap-3 rounded-md border px-3 py-2.5 hover:bg-secondary">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{s.step}</span>
                <span className="flex-1">{s.text}</span>
                <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
