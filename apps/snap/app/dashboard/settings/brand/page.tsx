import { redirect } from "next/navigation";
import Link from "next/link";

import { SettingsBrand } from "@/components/settings-brand";
import { brandAssetUrl, parseBrandAssets } from "@/lib/brand-assets";
import { getPlanEntitlements, PLANS } from "@/lib/plans";
import { parseWatermarkConfig } from "@/lib/watermark";
import { deterrentsOn } from "@/lib/branding";
import { getStudioProfile, getStudioSlug } from "@/lib/repos/studios";
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
  const snippetLimit = ent && ent.id !== "studio" && ent.id !== "pro" ? (ent.maxEmailSnippets ?? 5) : null;
  const assetBag = parseBrandAssets(profile.brandAssets);
  // WEB-242: watermark card state (null config → mode off).
  const wm = parseWatermarkConfig(profile.brand);
  // WEB-244: white-label card context.
  const slug = (await getStudioSlug(ctx.organizationId)) ?? "";

  return (
    <div className="flex flex-col gap-5">
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
      slug={slug}
      plan={(PLANS[profile.plan as keyof typeof PLANS] ? (profile.plan as "free" | "lite" | "studio" | "pro") : "free")}
      brandSteps={{
        logoDone: Boolean(profile.logoKey) && Boolean(assetBag.favicon && assetBag.ogCard),
        brandDone: Boolean(brand.accent) || Boolean(brand.fontFamily),
      }}
      chips={{
        favicon: assetBag.favicon ? brandAssetUrl(ctx.organizationId, "favicon", assetBag.rev) : null,
        emailHeader: assetBag.emailHeader ? brandAssetUrl(ctx.organizationId, "emailHeader", assetBag.rev) : null,
        ogCard: assetBag.ogCard ? brandAssetUrl(ctx.organizationId, "ogCard", assetBag.rev) : null,
      }}
      />
      <Link
        href="/dashboard/templates/emails"
        className="flex items-center justify-between rounded-[12px] border border-hairline bg-surface-1 p-5 text-sm transition-colors hover:border-primary/40"
      >
        <span className="text-ink">
          <strong className="font-medium">Email copy has moved.</strong>{" "}
          <span className="text-ink-subtle">Saved replies and automatic emails now live under Templates → Emails.</span>
        </span>
        <span className="shrink-0 font-medium text-primary">Open →</span>
      </Link>
    </div>
  );
}

