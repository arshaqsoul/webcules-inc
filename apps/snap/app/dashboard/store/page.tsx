/* /dashboard/store (WEB-277, Commerce C1 6/7) — the store home per the
 * approved WEB-175 handoff: store status (open/closed), Price lists /
 * Products tabs, first-run template picker, and "Preview the store as a
 * client". Free plan still sees the upgrade card (the store is Lite+).
 * Route states: loading.tsx (skeleton, aria-busy) and error.tsx
 * (role=alert card) carry the handoff copy. */
import Link from "next/link";
import { redirect } from "next/navigation";

import { StoreHome } from "@/components/store-home";
import { commerceGatesForPlan, getStoreOpen, listAllProducts, listPriceLists } from "@/lib/commerce";
import { getPlanEntitlements } from "@/lib/plans";
import { getStudioProfile } from "@/lib/repos/studios";
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

  const [lists, products, storeOpen, profile] = await Promise.all([
    listPriceLists(ctx.organizationId),
    listAllProducts(ctx.organizationId),
    getStoreOpen(ctx.organizationId),
    getStudioProfile(ctx.organizationId),
  ]);

  return (
    <StoreHome
      initialLists={lists}
      products={products}
      initialStoreOpen={storeOpen}
      payoutsConnected={Boolean(profile?.stripeAccountId)}
      gates={commerceGatesForPlan(ent)}
    />
  );
}
