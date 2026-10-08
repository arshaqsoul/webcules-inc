import { redirect } from "next/navigation";

import { PayoutsPanel } from "@/components/payouts-panel";
import { getOrgContext } from "@/lib/session";
import { can } from "@/lib/permissions";

export const metadata = { title: "Settings · Payouts" };

export default async function SettingsPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string; refresh?: string; oauth?: string }>;
}) {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  // WEB-275: payouts are owner-only.
  if (!can(ctx.role, "billing.write")) redirect("/dashboard/settings");
  const { return: returnParam, refresh: refreshParam, oauth: oauthParam } = await searchParams;

  return (
    <PayoutsPanel
      returnHint={
        returnParam === "1" ? "return" : refreshParam === "1" ? "refresh" : undefined
      }
      oauthResult={oauthParam}
    />
  );
}
