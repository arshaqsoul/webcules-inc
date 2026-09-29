import { redirect } from "next/navigation";

import { DomainsPanel } from "@/components/domains-panel";
import { CNAME_TARGET } from "@/lib/domains";
import { getPlanEntitlements } from "@/lib/plans";
import { listDomains } from "@/lib/repos/domains";
import { getStudioProfile, getStudioSlug } from "@/lib/repos/studios";
import { getOrgContext } from "@/lib/session";

export const metadata = { title: "Settings · Domains" };

export default async function SettingsDomainsPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  const [profile, slug, domains, ent] = await Promise.all([
    getStudioProfile(ctx.organizationId),
    getStudioSlug(ctx.organizationId),
    listDomains(ctx.organizationId),
    getPlanEntitlements(ctx.organizationId),
  ]);
  if (!profile) redirect("/onboarding");

  return (
    <DomainsPanel
      studioName={profile.studioName}
      slug={slug}
      initial={{
        domains: domains.map((d) => ({
          id: d.id,
          hostname: d.hostname,
          isPrimary: d.isPrimary,
          status: d.status,
          verificationToken: d.verificationToken,
          certStatus: d.certStatus,
          dcvTxtName: d.dcvTxtName,
          dcvTxtValue: d.dcvTxtValue,
          lastError: d.lastError,
          lastCheckedAt: d.lastCheckedAt,
        })),
        cnameTarget: CNAME_TARGET,
        maxCustomDomains: ent?.maxCustomDomains ?? 0,
        activeCustomDomains: ent?.activeCustomDomains ?? 0,
        plan: ent?.id ?? "free",
        addonCustomDomain: ent?.addonCustomDomain ?? false,
        hasSubscription: Boolean(profile?.stripeSubscriptionId),
      }}
    />
  );
}
