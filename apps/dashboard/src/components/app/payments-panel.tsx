"use client";

import { Banknote, CreditCard, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { LeadView, PayView, ProjectView } from "@/components/app/lead-detail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cancelSubscription, recordPayment, startManualSubscription } from "@/app/actions";
import { cad, fmtDate } from "@/lib/utils";

export function PaymentsPanel({
  lead,
  project,
  pays,
  subscription,
  stripeOn,
}: {
  lead: LeadView;
  project: ProjectView | null;
  pays: PayView[];
  subscription: { id: string; status: string; priceMonthlyCents: number } | null;
  stripeOn: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const oneTime = project?.quoteOneTime ?? 799;
  const monthly = project?.quoteMaintenance ?? 10;

  async function stripeCheckout(mode: "payment" | "subscription") {
    setBusy(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, mode, business: lead.business }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Stripe is not configured");
      toast.success("Checkout link created — opening Stripe");
      window.open(data.url, "_blank");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Collect the build payment</CardTitle>
          <CardDescription>
            {cad(oneTime)} one-time {project ? `(${project.tier}, ${project.pages} pages)` : "(default Standard — set a real quote in Pricing)"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button disabled={busy || !stripeOn} onClick={() => stripeCheckout("payment")}>
            <CreditCard /> {stripeOn ? "Stripe checkout link" : "Stripe not configured"}
          </Button>
          <RecordPaymentDialog
            leadId={lead.id}
            defaultAmountCents={oneTime * 100}
            kind="one_time"
            trigger={
              <Button variant="outline">
                <Banknote /> Record e-Transfer / cash
              </Button>
            }
          />
          {!stripeOn && (
            <p className="w-full text-xs text-muted-foreground">
              Card payments: add <code className="rounded bg-secondary px-1">STRIPE_SECRET_KEY</code> to <code className="rounded bg-secondary px-1">.env.local</code> and restart. Until
              then, record e-Transfers manually — they&apos;re the Saskatoon default anyway.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Care plan — {cad(monthly)}/mo</CardTitle>
          <CardDescription>Hosting, edits within 48 h, monthly AI-readiness check. Cancel anytime.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {subscription ? (
            <div className="flex items-center justify-between rounded-lg border bg-secondary/40 px-3 py-2.5">
              <div className="text-sm">
                <Badge variant={subscription.status === "active" || subscription.status === "manual" ? "success" : "muted"}>{subscription.status}</Badge>
                <span className="ml-2 text-muted-foreground">{cad(subscription.priceMonthlyCents, { cents: true })}/mo</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await cancelSubscription(subscription.id);
                    toast.success("Plan canceled");
                    router.refresh();
                  })
                }
              >
                Cancel plan
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy || !stripeOn} onClick={() => stripeCheckout("subscription")}>
                <RefreshCw /> {stripeOn ? "Start Stripe subscription" : "Stripe not configured"}
              </Button>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await startManualSubscription(lead.id, monthly * 100);
                    toast.success("Manual care plan tracked");
                    router.refresh();
                  })
                }
              >
                <Banknote /> Track manually (e-Transfer)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
          <CardDescription>{pays.length} recorded</CardDescription>
        </CardHeader>
        <CardContent>
          {pays.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet. The first payment flips this lead to Won automatically.</p>
          ) : (
            <div className="flex flex-col divide-y rounded-lg border">
              {pays.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant={p.method === "stripe" ? "info" : "muted"}>{p.method === "etransfer" ? "e-Transfer" : p.method}</Badge>
                    <span className="text-muted-foreground">
                      {p.kind === "one_time" ? "website build" : p.kind === "maintenance" ? "maintenance" : p.note || "other"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{fmtDate(p.createdAt)}</span>
                    <span className="font-medium tabular-nums">{cad(p.amountCents, { cents: true })}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function RecordPaymentDialog({
  leadId,
  defaultAmountCents,
  kind,
  trigger,
}: {
  leadId: string;
  defaultAmountCents: number;
  kind: "one_time" | "maintenance" | "other";
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState((defaultAmountCents / 100).toFixed(2));
  const [method, setMethod] = useState("etransfer");
  const [note, setNote] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>Money that already arrived — e-Transfer, cash, cheque.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              await recordPayment({
                leadId,
                kind,
                method: method as "etransfer" | "cash" | "other",
                amountCents: Math.round(parseFloat(amount || "0") * 100),
                note,
              });
              toast.success("Payment recorded");
              setOpen(false);
              setNote("");
              router.refresh();
            });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="amount">Amount (CAD)</Label>
              <Input id="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Method</Label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="border-input flex h-9 w-full rounded-md border bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="etransfer">Interac e-Transfer</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pnote">Note</Label>
            <Input id="pnote" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Invoice #, half now half at launch…" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Recording…" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
