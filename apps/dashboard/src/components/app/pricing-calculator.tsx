"use client";

import { BadgeCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveQuote } from "@/app/actions";
import { ADDONS, type AddonId, computeQuote, installmentFor } from "@/lib/pricing";
import { cad } from "@/lib/utils";

export function PricingCalculator({ leads }: { leads: { id: string; business: string; current: number | null }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pages, setPages] = useState(5);
  const [addons, setAddons] = useState<AddonId[]>([]);
  const [leadId, setLeadId] = useState<string>("none");

  const quote = useMemo(() => computeQuote(pages, addons), [pages, addons]);
  const savedPct = Math.max(0, Math.round((1 - quote.oneTime / quote.marketHigh) * 100));

  function toggleAddon(id: AddonId) {
    setAddons((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Quote builder</CardTitle>
          <CardDescription>Page count sets the tier, add-ons stack. Prices land on …99.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Pages</Label>
              <span className="text-sm font-semibold tabular-nums">{pages}</span>
            </div>
            <input
              type="range"
              min={1}
              max={15}
              value={pages}
              onChange={(e) => setPages(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-teal-700"
            />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>1</span>
              <span>Starter ≤3 · Standard 4–6 · Plus 7–10 · Premium 11+</span>
              <span>15</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Add-ons</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {ADDONS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggleAddon(a.id)}
                  className={`flex items-start justify-between gap-2 rounded-lg border p-2.5 text-left text-sm transition-colors cursor-pointer ${
                    addons.includes(a.id) ? "border-primary/50 bg-accent/50" : "hover:bg-secondary"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`flex size-4 items-center justify-center rounded-[4px] border text-[10px] ${
                        addons.includes(a.id) ? "border-primary bg-primary text-primary-foreground" : "border-input"
                      }`}
                    >
                      {addons.includes(a.id) ? "✓" : ""}
                    </span>
                    {a.label}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">+{cad(a.price)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border p-3 text-sm">
            <div className="mb-1.5 font-medium">Breakdown</div>
            {quote.breakdown.map((b, i) => (
              <div key={i} className="flex justify-between text-muted-foreground">
                <span>{b.label}</span>
                <span className="tabular-nums">{cad(b.amount)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2 self-start">
        <CardHeader>
          <CardTitle>The number</CardTitle>
          <CardDescription>What goes in the pitch</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-xl border bg-accent/40 p-4 text-center">
            <div className="text-4xl font-semibold tracking-tight tabular-nums">{cad(quote.oneTime)}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              one-time · or {cad(installmentFor(quote.oneTime).monthly)}/month × {installmentFor(quote.oneTime).months}
            </div>
            <div className="text-xs text-muted-foreground">
              {quote.tierLabel} tier · + {cad(quote.maintenanceMonthly)}/mo after
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
              <span>market range</span>
              <span>
                {cad(quote.marketLow)}–{cad(quote.marketHigh)}
              </span>
            </div>
            <div className="relative h-3 rounded-full bg-secondary">
              <div className="absolute inset-y-0 left-[12%] right-[8%] rounded-full bg-zinc-300" />
              <div className="absolute top-1/2 left-[10%] size-3.5 -translate-y-1/2 rounded-full border-2 border-card bg-primary shadow" title="Webcules price" />
            </div>
            <Badge variant="success" className="mt-2">
              <BadgeCheck /> clients save ~{savedPct}% vs studio quotes
            </Badge>
          </div>

          <div className="flex flex-col gap-2 border-t pt-4">
            <Label>Save this quote to a lead</Label>
            <div className="flex gap-2">
              <Select value={leadId} onValueChange={setLeadId}>
                <SelectTrigger className="min-w-0 flex-1">
                  <SelectValue placeholder="Pick a lead…" />
                </SelectTrigger>
                <SelectContent>
                  {leads.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No leads yet</div>}
                  {leads.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.business}
                      {l.current !== null ? ` (now ${cad(l.current)})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={leadId === "none" || pending}
                onClick={() =>
                  startTransition(async () => {
                    await saveQuote(leadId, quote);
                    toast.success("Quote saved to lead");
                    router.refresh();
                  })
                }
              >
                Save
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
