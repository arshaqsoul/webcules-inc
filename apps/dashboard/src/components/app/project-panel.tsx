"use client";

import { CheckCircle2, ExternalLink, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { ProjectView } from "@/components/app/lead-detail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProject } from "@/app/actions";
import { installmentFor } from "@/lib/pricing";
import { cad } from "@/lib/utils";

const LENS_LABEL: Record<string, string> = { uiux: "UI/UX", conversion: "Conversion", ai: "AI-readiness" };

function gradeVariant(g: string) {
  if (g.startsWith("A") || g.startsWith("B")) return "success" as const;
  if (g.startsWith("C")) return "warning" as const;
  return "destructive" as const;
}

export function ProjectPanel({ siteUrl, project }: { siteUrl: string; project: (ProjectView & { id: string }) | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [previewUrl, setPreviewUrl] = useState(project?.previewUrl ?? "");

  if (!project) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No redesign project yet</CardTitle>
          <CardDescription>
            Run <code className="rounded bg-secondary px-1 py-0.5 text-xs">/forge-redesign {siteUrl || "<their url>"}</code> — it audits the site, rebuilds
            it, and emits <code className="rounded bg-secondary px-1 py-0.5 text-xs">gtm.json</code>. Import it on the Forge page, or set a quote on the
            Pricing page.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href="/pricing">Set a quote manually</a>
          </Button>
          <Button variant="outline" asChild>
            <a href="/forge">Import from forge</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Expert audit — scorecard <Sparkles className="size-4 text-primary" />
          </CardTitle>
          <CardDescription>
            Grades from the design-expert review · project <code className="rounded bg-secondary px-1 py-0.5">{project.slug}</code>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {(["uiux", "conversion", "ai"] as const).map((k) => (
              <div key={k} className="rounded-lg border p-3 text-center">
                <div className="text-xs text-muted-foreground">{LENS_LABEL[k]}</div>
                <Badge variant={gradeVariant(project.grade[k])} className="mt-1 text-sm">
                  {project.grade[k]}
                </Badge>
              </div>
            ))}
          </div>
          {project.findings.length > 0 && (
            <div className="mt-4 flex flex-col divide-y rounded-lg border">
              {project.findings.map((f, i) => (
                <div key={i} className="p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={f.severity === "critical" ? "destructive" : f.severity === "major" ? "warning" : "muted"}>{f.severity}</Badge>
                    <span className="text-sm font-medium">{f.title}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{LENS_LABEL[f.lens] ?? f.lens}</span>
                  </div>
                  {f.cost && <p className="mt-1 text-xs text-muted-foreground">{f.cost}</p>}
                  {f.fix && (
                    <p className="mt-1 flex items-start gap-1.5 text-xs text-emerald-700">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" /> {f.fix}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>The offer</CardTitle>
          <CardDescription>What this client sees in the pitch</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="rounded-lg border bg-accent/40 p-3">
            <div className="text-xs text-muted-foreground">
              One-time — market: {cad(project.marketLow)}–{cad(project.marketHigh)}
            </div>
            <div className="text-2xl font-semibold tabular-nums">{cad(project.quoteOneTime)}</div>
            {(() => {
              const plan = installmentFor(project.quoteOneTime);
              return (
                <div className="text-xs text-muted-foreground">
                  or {cad(plan.monthly)}/month × {plan.months}
                </div>
              );
            })()}
            <div className="mt-1 text-xs text-muted-foreground">
              + {cad(project.quoteMaintenance)}/mo maintenance · {project.pages} pages · {project.tier}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="previewUrl">Preview URL (workers.dev)</Label>
            <div className="flex gap-2">
              <Input id="previewUrl" value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} placeholder="https://acme.workers.dev" />
              <Button
                variant="outline"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await updateProject(project.id, { previewUrl });
                    toast.success("Preview URL saved");
                    router.refresh();
                  })
                }
              >
                Save
              </Button>
            </div>
            {previewUrl && (
              <a href={previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <ExternalLink className="size-3" /> open preview
              </a>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
