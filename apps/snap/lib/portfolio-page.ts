/* Server-side resolution shared by the public portfolio pages (WEB-346):
 * one query set that turns a site slug + request host into everything the
 * page needs — the published payload, the owning org's entitlements (badge,
 * budget), the studio profile (contact, booking), and the canonical origin
 * (subdomain for Lite+, the app origin for the Free path URL). Lives outside
 * the page files so the collection page, the sitemap route and tests share
 * the exact same rules. */
import { portfolioSlugFromHost, PUBLIC_ORIGIN } from "./hosts";
import { appOrigin } from "./app-origin";
import { getPlanEntitlements } from "./plans";
import {
  countPortfolioViews,
  getPublishedPortfolio,
  type PublicPortfolio,
} from "./repos/portfolio";
import { getStudioProfile, getStudioSlug } from "./repos/studios";
import { parsePortfolioTheme, type PortfolioTheme } from "./portfolio-theme";
import type { SeoContext } from "./portfolio-seo";

export type PublicPortfolioPage = {
  portfolio: PublicPortfolio;
  theme: PortfolioTheme;
  /** The origin the site is canonically served from for THIS request. */
  origin: string;
  ctx: SeoContext;
  studioName: string;
  studioSlug: string;
  contactEmail: string | null;
  bookingHref: string | null;
  /** WEB-302 §4: Free's 100k image-views/mo — at budget the public pages
   * render the neutral cap state (never a 500, WEB-346 AC3). */
  overBudget: boolean;
  viewBudget: number | null;
  viewsUsed: number;
  /** "Delivered by Snap" badge: Free/Lite show it, Studio+ (white-label)
   * never do (WEB-346 AC4 / WEB-302 §4). */
  showBadge: boolean;
};

/** The canonical public origin for a portfolio request: the site's own
 * subdomain when the request arrived on it AND the plan serves subdomains
 * (Lite+), else the app origin (the Free path URL is the only free
 * surface — the WEB-351 leakage floor).
 *
 * WEB-411: the app origin is the DEPLOYMENT's own (lib/app-origin.ts reads
 * NEXT_PUBLIC_APP_URL — https://snaphq.app in production, the staging URL on
 * staging), so a non-canonical host canonicalizes within its environment
 * instead of emitting production URLs from staging. On production the var IS
 * PUBLIC_ORIGIN, so prod behavior is unchanged. The param default keeps the
 * pure function unit-testable without worker env. */
export function portfolioOrigin(
  host: string,
  planAllowsSubdomain: boolean,
  origin: string = PUBLIC_ORIGIN,
): string {
  const slug = portfolioSlugFromHost(host);
  return slug && planAllowsSubdomain
    ? `https://${host.split(",")[0].trim().toLowerCase()}`
    : origin;
}

export function planAllowsSubdomain(plan: string | null | undefined): boolean {
  return plan === "lite" || plan === "studio" || plan === "pro";
}

export async function resolvePublicPortfolioPage(
  slug: string,
  host: string,
): Promise<PublicPortfolioPage | null> {
  const portfolio = await getPublishedPortfolio(slug);
  if (!portfolio) return null;
  const [ent, profile, studioSlug, viewsUsed] = await Promise.all([
    getPlanEntitlements(portfolio.organizationId),
    getStudioProfile(portfolio.organizationId),
    getStudioSlug(portfolio.organizationId),
    countPortfolioViews(portfolio.organizationId),
  ]);
  const plan = ent?.id ?? "free";
  const budget = ent?.portfolioImageViewsPerMonth ?? null;
  const firstCover =
    portfolio.collections.find((c) => c.coverImage)?.coverImage ??
    portfolio.collections[0]?.items[0]?.image ??
    null;
  // WEB-411: the deployment's own app origin (staging lands on staging), not
  // the compile-time production constant.
  const origin = portfolioOrigin(host, planAllowsSubdomain(plan), await appOrigin());
  const studioName = profile?.studioName ?? "Studio";
  const ctx: SeoContext = {
    siteSlug: portfolio.slug,
    origin,
    studioName,
    contactEmail: profile?.contactEmail ?? null,
    ogImage: firstCover ? `${origin}${firstCover}` : null,
  };
  return {
    portfolio,
    theme: parsePortfolioTheme(portfolio.theme) ?? {},
    origin,
    ctx,
    studioName,
    studioSlug,
    contactEmail: profile?.contactEmail ?? null,
    bookingHref: studioSlug ? `/b/${studioSlug}` : null,
    overBudget: budget !== null && viewsUsed >= budget,
    viewBudget: budget,
    viewsUsed,
    showBadge: !(ent?.whiteLabel ?? false),
  };
}
