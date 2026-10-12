/* /dashboard/store (WEB-179, Commerce C1 2/7) — price lists home. Free plan
 * sees the upgrade card (the store is Lite+); everyone else gets the lists
 * panel with the wizard. */
import Link from "next/link";
import { redirect } from "next/navigation";

import { CommercePriceLists } from "@/components/commerce-price-lists";
import { commerceGatesForPlan, listPriceLists } from "@/lib/commerce";
import { getPlanEntitlements } from "@/lib/plans";
import { getOrgContext } from "@/lib/session";

export const metadata = { title: "Store" };
export const dynamic = "force-dynamic";

export default async function StorePage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  const ent = await getPlanEntitlements(ctx.organizationId);
  if (!ent) redirect("/onboarding");

  if (!ent.storeEnabled) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.6px] text-ink">Sell from your galleries</h1>
        <p className="max-w-md text-sm text-ink-subtle">
          Your store — studio-wide price lists, digital products, prints and packages — is available from the Lite plan up.
        </p>
        <Link
          href="/dashboard/settings/billing"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          See plans &amp; upgrade
        </Link>
      </div>
    );
  }

  const lists = await listPriceLists(ctx.organizationId);
  return <CommercePriceLists initialLists={lists} gates={commerceGatesForPlan(ent)} />;
}
