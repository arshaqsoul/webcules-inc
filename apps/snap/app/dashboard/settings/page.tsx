import { redirect } from "next/navigation";

import { PayoutsPanel } from "@/components/payouts-panel";
import { PlanPanel } from "@/components/plan-panel";
import { SettingsForm } from "@/components/settings-form";
import { getStudioProfile, getStudioSlug } from "@/lib/repos/studios";
import { getOrgContext } from "@/lib/session";

export const metadata = { title: "Settings" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ payouts?: string; plan?: string }>;
}) {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  const profile = await getStudioProfile(ctx.organizationId);
  if (!profile) redirect("/onboarding");
  const slug = await getStudioSlug(ctx.organizationId);
  const { payouts, plan } = await searchParams;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.6px] text-ink">Settings</h1>
        <p className="mt-1 text-sm text-ink-subtle">Studio profile, branding, and embed configuration.</p>
      </div>
      <PlanPanel returnHint={plan === "return" ? "return" : undefined} />
      <SettingsForm
        initial={{
          slug,
          studioName: profile.studioName,
          timezone: profile.timezone,
          contactEmail: profile.contactEmail ?? "",
          accentColor: (JSON.parse(profile.brand || "{}") as { accent?: string }).accent ?? "#5e6ad2",
          embedKey: profile.embedKey ?? "",
          embedOrigins: JSON.parse(profile.embedOrigins || "[]") as string[],
          hasLogo: Boolean(profile.logoKey),
          logoUrl: profile.logoKey ? `/api/embed/logo?key=${profile.embedKey}` : null,
        }}
      />
      <PayoutsPanel returnHint={payouts === "return" ? "return" : payouts === "refresh" ? "refresh" : undefined} />
    </div>
  );
}
