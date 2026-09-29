import { redirect } from "next/navigation";

import { PlanPanel } from "@/components/plan-panel";
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

  return <PlanPanel returnHint={returnParam === "1" ? "return" : undefined} />;
}
