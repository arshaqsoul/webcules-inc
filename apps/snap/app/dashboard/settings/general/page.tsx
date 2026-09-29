import { redirect } from "next/navigation";

import { SettingsGeneral } from "@/components/settings-general";
import { getStudioProfile, getStudioSlug } from "@/lib/repos/studios";
import { getOrgContext } from "@/lib/session";

export const metadata = { title: "Settings · General" };

export default async function SettingsGeneralPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
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
    />
  );
}
