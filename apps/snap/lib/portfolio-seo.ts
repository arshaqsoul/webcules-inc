/* Portfolio public-page SEO helpers (WEB-346) — pure builders the SSR pages
 * stringify into <script type="application/ld+json"> and the sitemap route.
 * No React imports so tests can exercise them directly (JSX can't run under
 * workerd tests). */
import type { PublicPortfolio, PublicPortfolioCollection } from "./repos/portfolio";
import { defaultPortfolioHome, parsePortfolioHome } from "./portfolio-theme";

/** Parsed seo JSON as stored on portfolio_site.seo. */
export type PortfolioSeo = { title?: string; description?: string };

export function parsePortfolioSeo(input: unknown): PortfolioSeo {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const raw = input as Record<string, unknown>;
  const out: PortfolioSeo = {};
  if (typeof raw.title === "string" && raw.title.trim()) out.title = raw.title.trim().slice(0, 120);
  if (typeof raw.description === "string" && raw.description.trim()) {
    out.description = raw.description.trim().slice(0, 300);
  }
  return out;
}

export type SeoContext = {
  siteSlug: string;
  /** Absolute origin the site is served from (subdomain for Lite+, the app
   * origin for the Free path URL). */
  origin: string;
  studioName: string;
  contactEmail: string | null;
  /** Absolute OG image URL (a signed pubimg link) or null. */
  ogImage: string | null;
};

/** The home sections a site renders, canonicalized (the stored home is
 * already canonical from the write path; this defends public rendering
 * against hand-edited rows — an unknown section never crashes the page). */
export function portfolioSections(portfolio: PublicPortfolio) {
  const parsed = parsePortfolioHome(portfolio.home);
  return parsed.length ? parsed : defaultPortfolioHome();
}

export function portfolioHomeUrl(ctx: SeoContext): string {
  return `${ctx.origin}/portfolio/${ctx.siteSlug}`;
}

export function collectionUrl(ctx: SeoContext, collectionSlug: string): string {
  return `${portfolioHomeUrl(ctx)}/c/${collectionSlug}`;
}

/** schema.org LocalBusiness (Photograph type) for the portfolio home. */
export function localBusinessJsonLd(ctx: SeoContext, portfolio: PublicPortfolio) {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: ctx.studioName,
    url: portfolioHomeUrl(ctx),
    ...(ctx.contactEmail ? { email: ctx.contactEmail } : {}),
    ...(ctx.ogImage ? { image: [ctx.ogImage] } : {}),
    ...(portfolio.publishedAt ? { datePublished: portfolio.publishedAt.toISOString() } : {}),
  };
}

/** schema.org ImageGallery for a collection page. */
export function imageGalleryJsonLd(
  ctx: SeoContext,
  collection: PublicPortfolioCollection,
  studioName: string,
) {
  return {
    "@context": "https://schema.org",
    "@type": "ImageGallery",
    name: collection.title,
    ...(collection.subtitle ? { description: collection.subtitle } : {}),
    url: collectionUrl(ctx, collection.slug),
    isPartOf: { "@type": "WebSite", name: studioName, url: portfolioHomeUrl(ctx) },
    image: collection.items.slice(0, 30).map((i) => ({
      "@type": "ImageObject",
      contentUrl: `${ctx.origin}${i.image}`,
      ...(i.caption ? { name: i.caption } : {}),
      ...(i.width && i.height ? { width: i.width, height: i.height } : {}),
    })),
  };
}

/** The per-site sitemap: the home page + every visible collection, in
 * document order, lastmod from the site's publishedAt. */
export function portfolioSitemap(ctx: SeoContext, portfolio: PublicPortfolio): string {
  const lastmod = portfolio.publishedAt?.toISOString() ?? new Date().toISOString();
  const urls = [
    { loc: portfolioHomeUrl(ctx), priority: "1.0" },
    ...portfolio.collections.map((c) => ({
      loc: collectionUrl(ctx, c.slug),
      priority: "0.8",
    })),
  ];
  const body = urls
    .map(
      (u) =>
        `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${u.priority}</priority>\n  </url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
