import { redirect } from "next/navigation";

import { SettingsGeneral } from "@/components/settings-general";
import { parseBusiness } from "@/lib/business";
import { getStudioProfile, getStudioSlug } from "@/lib/repos/studios";
import { getOrgContext } from "@/lib/session";
import { can } from "@/lib/permissions";

export const metadata = { title: "Settings · General" };

export default async function SettingsGeneralPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  // WEB-275: studio settings are admin+ (Security stays self-account).
  if (!can(ctx.role, "settings.read")) redirect("/dashboard");
  const [profile, slug] = await Promise.all([
    getStudioProfile(ctx.organizationId),
    getStudioSlug(ctx.organizationId),
  ]);
  if (!profile) redirect("/onboarding");

  return (
    <SettingsGeneral
      studioName={profile.studioName}
      slug={slug}
      timezone={profile.timezone}
      contactEmail={profile.contactEmail ?? ""}
      business={parseBusiness(profile.business ?? null, profile.studioName)}
    />
  );
}
