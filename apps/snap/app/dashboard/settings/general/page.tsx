import { redirect } from "next/navigation";

import { SettingsForm } from "@/components/settings-form";
import { getStudioProfile, getStudioSlug } from "@/lib/repos/studios";
import { getOrgContext } from "@/lib/session";

import { settingsFormInitial } from "../form-initial";

export const metadata = { title: "Settings · General" };

export default async function SettingsGeneralPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  const [profile, slug] = await Promise.all([
    getStudioProfile(ctx.organizationId),
    getStudioSlug(ctx.organizationId),
  ]);
  if (!profile) redirect("/onboarding");

  return <SettingsForm brandRevision={String(profile.updatedAt?.getTime() ?? "")} initial={settingsFormInitial(profile, slug)} />;
}
