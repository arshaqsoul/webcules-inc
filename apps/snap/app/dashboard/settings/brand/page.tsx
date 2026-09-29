import { redirect } from "next/navigation";

import { SettingsBrand } from "@/components/settings-brand";
import { brandAssetUrl, parseBrandAssets } from "@/lib/brand-assets";
import { getPlanEntitlements } from "@/lib/plans";
import { parseWatermarkConfig } from "@/lib/watermark";
import { deterrentsOn } from "@/lib/branding";
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
    removeBranding?: boolean;
  };
  // WEB-238: the entitlement gates the toggle; the toggle gates the surfaces.
  const ent = await getPlanEntitlements(ctx.organizationId);
  const assetBag = parseBrandAssets(profile.brandAssets);
  // WEB-242: watermark card state (null config → mode off).
  const wm = parseWatermarkConfig(profile.brand);

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
      whiteLabelEntitled={ent?.whiteLabel ?? false}
      removeBranding={brand.removeBranding === true}
      hasBrandAssets={Boolean(assetBag.favicon && assetBag.ogCard)}
      studioName={profile.studioName}
      watermark={{
        mode: wm?.mode ?? "off",
        opacity: wm?.opacity ?? 0.25,
        scale: wm?.scale ?? 0.2,
        margin: wm?.margin ?? 0.04,
        text: wm?.text ?? "",
      }}
      watermarkLogoUrl={assetBag.watermark ? brandAssetUrl(ctx.organizationId, "watermark", assetBag.rev) : null}
      deterrentsOn={deterrentsOn(ent, profile.brand)}
    />
  );
}
