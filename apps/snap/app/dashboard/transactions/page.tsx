import Link from "next/link";
import { redirect } from "next/navigation";

import { listPayments } from "@/lib/repos/payments";
import { getOrgContext } from "@/lib/session";

export const metadata = { title: "Transactions" };

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  succeeded: "bg-success/10 text-success-text",
  failed: "bg-destructive/10 text-destructive",
  refunded: "bg-surface-2 text-ink-subtle",
};

function money(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amountMinor / 100);
}

export default async function TransactionsPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  const payments = await listPayments(ctx.organizationId);

  const totals = payments.reduce(
    (acc, p) => {
      if (p.status === "succeeded") acc.succeeded += p.amountMinor;
      if (p.status === "refunded") acc.refunded += p.amountMinor;
      return acc;
    },
    { succeeded: 0, refunded: 0 },
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.6px] text-ink">Transactions</h1>
          <p className="mt-1 text-sm text-ink-subtle">Every booking payment across your studio.</p>
        </div>
        <div className="flex gap-5 text-sm">
          <div>
            <p className="text-xs text-ink-tertiary">Collected</p>
            <p className="font-medium text-success-text">{money(totals.succeeded, "usd")}</p>
          </div>
          <div>
            <p className="text-xs text-ink-tertiary">Refunded</p>
            <p className="font-medium text-ink-subtle">{money(totals.refunded, "usd")}</p>
          </div>
        </div>
      </div>

      <section className="overflow-hidden rounded-[12px] border border-hairline bg-surface-1">
        {payments.length === 0 ? (
          <p className="p-8 text-center text-sm text-ink-subtle">
            No payments yet — they'll appear here when clients pay for bookings.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-ink-tertiary">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 text-ink-muted">
                    {(p.occurredAt ?? p.createdAt).slice(0, 10)}
                  </td>
                  <td className="max-w-60 truncate px-4 py-3">
                    {p.projectTitle ? (
                      <Link href={`/dashboard/projects/${p.projectId}`} className="text-ink hover:underline">
                        {p.projectTitle}
                      </Link>
                    ) : (
                      <span className="text-ink-subtle">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{p.kind}</td>
                  <td className="px-4 py-3 text-right font-medium text-ink">{money(p.amountMinor, p.currency)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[p.status] ?? ""}`}>
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
