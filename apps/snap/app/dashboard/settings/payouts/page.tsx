import { redirect } from "next/navigation";

import { PayoutsPanel } from "@/components/payouts-panel";
import { getOrgContext } from "@/lib/session";

export const metadata = { title: "Settings · Payouts" };

export default async function SettingsPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string; refresh?: string }>;
}) {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  const { return: returnParam, refresh: refreshParam } = await searchParams;

  return (
    <PayoutsPanel
      returnHint={
        returnParam === "1" ? "return" : refreshParam === "1" ? "refresh" : undefined
      }
    />
  );
}
