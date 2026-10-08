/* Brand asset pipeline (WEB-239 white-label 2/8) — the shared vocabulary
 * for generated brand assets: names, file names, per-kind byte caps, R2 key
 * layout, the studio_profiles JSON bag shape, and public serving URLs.
 * Generation happens in the BROWSER (canvas) — the margin rule; the server
 * only validates kinds/sizes and stores. */
import { env } from "cloudflare:workers";

import { getObject } from "./storage/service";
import { PUBLIC_ORIGIN } from "@/lib/hosts";
export const BRAND_ASSET_NAMES = ["favicon", "appleTouch", "emailHeader", "ogCard", "watermark"] as const;
export type BrandAssetName = (typeof BRAND_ASSET_NAMES)[number];

/** URL file names (also the [asset] route param values). */
export const BRAND_ASSET_FILES: Record<BrandAssetName, string> = {
  favicon: "favicon-32.png",
  appleTouch: "apple-touch-180.png",
  emailHeader: "email-header.png",
  ogCard: "og-card.png",
  watermark: "watermark-source.png",
};

export function brandAssetForFile(file: string): BrandAssetName | null {
  for (const name of BRAND_ASSET_NAMES) {
    if (BRAND_ASSET_FILES[name] === file) return name;
  }
  return null;
}

/** Server-side kind/size caps — generated assets are PNGs by construction;
 * caps leave headroom over the targets (favicon ~2–5 KB, OG ~100 KB). */
export const BRAND_ASSET_LIMITS: Record<BrandAssetName, { maxBytes: number; contentType: "image/png" }> = {
  favicon: { maxBytes: 64 * 1024, contentType: "image/png" },
  appleTouch: { maxBytes: 128 * 1024, contentType: "image/png" },
  emailHeader: { maxBytes: 256 * 1024, contentType: "image/png" },
  ogCard: { maxBytes: 512 * 1024, contentType: "image/png" },
  watermark: { maxBytes: 512 * 1024, contentType: "image/png" },
};

/** The persisted bag: R2 keys (org-prefixed) + a revision stamp that
 * cache-busts public URLs (regeneration only happens on demand). */
export type BrandAssetBag = { rev?: string } & Partial<Record<BrandAssetName, string>>;

export function parseBrandAssets(json: string | null | undefined): BrandAssetBag {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json) as BrandAssetBag;
    if (!parsed || typeof parsed !== "object") return {};
    const bag: BrandAssetBag = {};
    if (typeof parsed.rev === "string" && parsed.rev) bag.rev = parsed.rev;
    for (const name of BRAND_ASSET_NAMES) {
      const v = parsed[name];
      if (typeof v === "string" && v) bag[name] = v;
    }
    return bag;
  } catch {
    return {};
  }
}

/** R2 suffix under the org's branding prefix — revision-stamped so a
 * regenerate writes NEW objects (old URLs in the wild keep working until
 * cleanup, same trade-off as logo replacement). */
export function brandAssetKeySuffix(name: BrandAssetName, rev: string): string {
  return `branding/assets/${BRAND_ASSET_FILES[name].replace(".png", "")}-${rev}.png`;
}

/** Validation for the upload route: returns an error code or null. */
export function validateBrandAssetFile(name: BrandAssetName, file: File): string | null {
  const cap = BRAND_ASSET_LIMITS[name];
  if (file.type !== cap.contentType) return "unsupported_type";
  if (file.size <= 0) return "empty";
  if (file.size > cap.maxBytes) return "too_large";
  return null;
}

/** Public serving URL (the authorized-proxy sibling of /api/embed/logo —
 * same audience: anything a client or scraper can see). */
export function brandAssetUrl(organizationId: string, name: BrandAssetName, rev: string | undefined): string {
  const q = rev ? `?rev=${encodeURIComponent(rev)}` : "";
  return `/api/brand/${organizationId}/${BRAND_ASSET_FILES[name]}${q}`;
}

/** Next metadata `icons` for client pages — null when no generated favicon
 * (caller emits nothing → platform default favicon). */
export function brandIcons(
  bag: BrandAssetBag,
  organizationId: string,
): { icon: string; apple: string } | null {
  if (!bag.favicon) return null;
  return {
    icon: brandAssetUrl(organizationId, "favicon", bag.rev),
    apple: brandAssetUrl(organizationId, "appleTouch", bag.rev),
  };
}

/** og:image URL (studio OG card) or null. ABSOLUTE — og tags are fetched by
 * scrapers, and a relative path would resolve against the render host's
 * default base (localhost in dev) instead of the app origin. */
export function brandOgImage(bag: BrandAssetBag, organizationId: string): string | null {
  if (!bag.ogCard) return null;
  const origin = env.NEXT_PUBLIC_APP_URL ?? PUBLIC_ORIGIN;
  return `${origin}${brandAssetUrl(organizationId, "ogCard", bag.rev)}`;
}

/** WEB-241: the email-header logo as PNG bytes, straight from R2 (in-worker,
 * never the public proxy) for PDF embedding. Null when absent/unreadable. */
export async function fetchEmailHeaderLogo(
  organizationId: string,
  brandAssetsJson: string | null | undefined,
): Promise<Uint8Array | null> {
  const bag = parseBrandAssets(brandAssetsJson);
  if (!bag.emailHeader) return null;
  try {
    const obj = await getObject(organizationId, bag.emailHeader);
    if (!obj) return null;
    return new Uint8Array(await obj.arrayBuffer());
  } catch (err) {
    console.error("email-header logo fetch failed:", String(err));
    return null;
  }
}
