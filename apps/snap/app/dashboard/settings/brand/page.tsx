import { redirect } from "next/navigation";

import { SettingsBrand } from "@/components/settings-brand";
import { getStudioProfile } from "@/lib/repos/studios";
import { getOrgContext } from "@/lib/session";

export const metadata = { title: "Settings · Brand" };

export default async function SettingsBrandPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  const profile = await getStudioProfile(ctx.organizationId);
  if (!profile) redirect("/onboarding");

  const brand = JSON.parse(profile.brand || "{}") as {
    accent?: string;
    fontFamily?: string;
    theme?: string;
    tokens?: unknown;
  };

  return (
    <SettingsBrand
      embedKey={profile.embedKey ?? ""}
      hasLogo={Boolean(profile.logoKey)}
      logoUrl={profile.logoKey ? `/api/embed/logo?key=${profile.embedKey}` : null}
      accentColor={brand.accent ?? "#5e6ad2"}
      fontFamily={brand.fontFamily ?? ""}
      theme={brand.theme ?? "light"}
      tokens={JSON.stringify(brand.tokens ?? {}, null, 1)}
      brandRevision={String(profile.updatedAt?.getTime() ?? "")}
    />
  );
}
