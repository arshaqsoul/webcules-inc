import { redirect } from "next/navigation";

import { SettingsEmbeds } from "@/components/settings-embeds";
import { clientUrl } from "@/lib/client-urls";
import { getStudioProfile, getStudioSlug } from "@/lib/repos/studios";
import { listTemplates } from "@/lib/repos/templates";
import { getPlanEntitlements } from "@/lib/plans";
import { parseBookingPageConfig } from "@/lib/booking-page";
import { getOrgContext } from "@/lib/session";

export const metadata = { title: "Settings · Embeds" };

export default async function SettingsEmbedsPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  const [profile, slug, formTemplates, ent] = await Promise.all([
    getStudioProfile(ctx.organizationId),
    getStudioSlug(ctx.organizationId),
    listTemplates(ctx.organizationId, "form"),
    getPlanEntitlements(ctx.organizationId),
  ]);
  if (!profile) redirect("/onboarding");

  const brand = JSON.parse(profile.brand || "{}") as {
    accent?: string;
    fontFamily?: string;
    theme?: string;
  };

  return (
    <SettingsEmbeds
      embedKey={profile.embedKey ?? ""}
      slug={slug}
      bookingUrl={await clientUrl(ctx.organizationId, `/b/${slug}`)}
      studioTheme={brand.theme ?? "light"}
      studioAccent={brand.accent ?? "#5e6ad2"}
      studioFontFamily={brand.fontFamily ?? ""}
      embedOrigins={JSON.parse(profile.embedOrigins || "[]") as string[]}
      brandRevision={String(profile.updatedAt?.getTime() ?? "")}
      forms={formTemplates.map((t) => ({ id: t.id, name: t.name, isDefault: Boolean(t.isDefault) }))}
      bookingPage={{
        config: parseBookingPageConfig(profile.bookingPage ?? null),
        canEdit: ent ? ent.id !== "free" : false,
        url: `/b/${slug}`,
      }}
    />
  );
}
