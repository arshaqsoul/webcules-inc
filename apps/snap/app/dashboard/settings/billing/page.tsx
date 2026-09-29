import { redirect } from "next/navigation";

import { PlanPanel } from "@/components/plan-panel";
import { InvoiceDesignCard } from "@/components/invoice-design-card";
import { getStudioInvoiceSettings } from "@/lib/invoices";
import { getOrgContext } from "@/lib/session";

export const metadata = { title: "Settings · Billing" };

export default async function SettingsBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string }>;
}) {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  const { return: returnParam } = await searchParams;
  const invoiceSettings = await getStudioInvoiceSettings(ctx.organizationId);

  return (
    <div className="flex flex-col gap-5">
      <PlanPanel returnHint={returnParam === "1" ? "return" : undefined} />
      <InvoiceDesignCard initial={invoiceSettings} />
    </div>
  );
}
