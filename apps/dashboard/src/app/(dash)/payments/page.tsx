import { desc, eq } from "drizzle-orm";
import { Banknote, CreditCard, Repeat, Wallet } from "lucide-react";
import Link from "next/link";

import { StatCard } from "@/components/app/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { leads, payments, subscriptions } from "@/db/schema";
import { stripeEnabled } from "@/lib/stripe";
import { cad, fmtDate } from "@/lib/utils";

export default async function PaymentsPage() {
  const pays = await db
    .select({ pay: payments, business: leads.business })
    .from(payments)
    .leftJoin(leads, eq(payments.leadId, leads.id))
    .orderBy(desc(payments.createdAt));
  const subs = await db.select().from(subscriptions);
  const subsByStatus = new Map<string, number>();
  for (const s of subs) subsByStatus.set(s.status, (subsByStatus.get(s.status) ?? 0) + 1);

  const paid = pays.filter((p) => p.pay.status === "paid");
  const totalCollected = paid.reduce((s, p) => s + p.pay.amountCents, 0) / 100;
  const mrr = subs
    .filter((s) => s.status === "active" || s.status === "manual")
    .reduce((s, x) => s + x.priceMonthlyCents, 0) / 100;
  const avgOneTime =
    paid.filter((p) => p.pay.kind === "one_time").reduce((s, p) => s + p.pay.amountCents, 0) /
    Math.max(1, paid.filter((p) => p.pay.kind === "one_time").length) / 100;
  const stripeOn = stripeEnabled();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
          <p className="text-sm text-muted-foreground">Every dollar, from Stripe checkout links to Interac e-Transfers.</p>
        </div>
        <Badge variant={stripeOn ? "success" : "warning"} className="gap-1.5">
          {stripeOn ? <CreditCard className="size-3" /> : <Banknote className="size-3" />}
          {stripeOn ? "Stripe connected" : "manual mode — add STRIPE_SECRET_KEY for cards"}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Wallet} label="Collected all-time" value={cad(totalCollected)} hint={`${paid.length} payments`} accent />
        <StatCard icon={Repeat} label="Maintenance MRR" value={`${cad(mrr)}/mo`} hint={`${subsByStatus.get("active") ?? 0} stripe · ${subsByStatus.get("manual") ?? 0} manual`} />
        <StatCard icon={CreditCard} label="Avg build payment" value={cad(Number.isFinite(avgOneTime) ? avgOneTime : 0)} hint="one-time deals" />
        <StatCard icon={Banknote} label="Stripe webhook" value={process.env.STRIPE_WEBHOOK_SECRET ? "armed" : "off"} hint="stripe listen → forward to /api/stripe/webhook" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payment log</CardTitle>
          <CardDescription>Newest first · one-time payments flip their lead to Won automatically</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-2">Business</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="pr-2 text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pays.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    No payments yet. Send a Stripe link from a lead's Payments tab, or record an e-Transfer there.
                  </TableCell>
                </TableRow>
              )}
              {pays.map(({ pay, business }) => (
                <TableRow key={pay.id}>
                  <TableCell className="pl-2">
                    {pay.leadId ? (
                      <Link href={`/leads/${pay.leadId}`} className="font-medium hover:underline">
                        {business ?? "—"}
                      </Link>
                    ) : (
                      "—"
                    )}
                    {pay.note && <div className="text-xs text-muted-foreground">{pay.note}</div>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{pay.kind === "one_time" ? "website build" : pay.kind}</TableCell>
                  <TableCell>
                    <Badge variant={pay.method === "stripe" ? "info" : "muted"}>{pay.method === "etransfer" ? "e-Transfer" : pay.method}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(pay.createdAt)}</TableCell>
                  <TableCell className={`pr-2 text-right font-medium tabular-nums ${pay.status === "paid" ? "" : "text-muted-foreground line-through"}`}>
                    {cad(pay.amountCents, { cents: true })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
