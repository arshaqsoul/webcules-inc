import { redirect } from "next/navigation";

import { SettingsDelivery } from "@/components/settings-delivery";
import { getPlanEntitlements } from "@/lib/plans";
import { getStudioProfile } from "@/lib/repos/studios";
import { getOrgContext } from "@/lib/session";
import { can } from "@/lib/permissions";

export const metadata = { title: "Settings · Delivery" };

export default async function SettingsDeliveryPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  // WEB-275: studio settings are admin+ (Security stays self-account).
  if (!can(ctx.role, "settings.read")) redirect("/dashboard");
  const [profile, ent] = await Promise.all([
    getStudioProfile(ctx.organizationId),
    getPlanEntitlements(ctx.organizationId),
  ]);
  if (!profile) redirect("/onboarding");

  const rejected = JSON.parse(profile.rejectedPolicy || "{}") as {
    enabled?: boolean;
    retainDays?: number;
  };

  return (
    <SettingsDelivery
      rejectedRetentionDays={rejected.enabled ? (rejected.retainDays ?? 30) : 0}
      exifStripDerived={profile.exifStripDerived}
      defaultExpiryDays={profile.defaultExpiryDays ?? null}
      defaultAllowDownload={profile.defaultAllowDownload ?? true}
      rawStatus={{
        rawAllowed: ent?.rawAllowed ?? false,
        rawTrialBytes: ent?.rawTrialBytes ?? null,
        rawBytesUsed: ent?.rawBytesUsed ?? 0,
        planName: ent?.name ?? "Free",
      }}
    />
  );
}
