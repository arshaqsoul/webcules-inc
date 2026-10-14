/* Public portfolio collection view — /portfolio/{slug}/c/{cslug} (WEB-346,
 * WEB-304 screen 11): grid → lightbox with keyboard nav, JSON-LD
 * ImageGallery. Unlisted/removed collections are structurally absent from
 * the published payload, so they 404 here exactly like unknown slugs. */
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { resolvePublicPortfolioPage } from "@/lib/portfolio-page";
import { collectionUrl, imageGalleryJsonLd, parsePortfolioSeo } from "@/lib/portfolio-seo";
import { DEFAULT_PORTFOLIO_THEME, portfolioThemeCss } from "@/lib/portfolio-theme";
import { requestHost } from "@/lib/domains";
import { PUBLIC_ORIGIN } from "@/lib/hosts";
import { fontFamilyOf, FONTS_CSS_HREF } from "@/lib/fonts";
import { PortfolioGrid } from "@/components/portfolio-lightbox";

export const dynamic = "force-dynamic";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; cslug: string }>;
}): Promise<Metadata> {
  const { slug, cslug } = await params;
  if (!SLUG_RE.test(slug) || !SLUG_RE.test(cslug)) return {};
  const page = await resolvePublicPortfolioPage(slug, requestHost(await headers()) ?? "");
  const collection = page?.portfolio.collections.find((c) => c.slug === cslug);
  if (!page || !collection) return { robots: { index: false } };
  const seo = parsePortfolioSeo(page.portfolio.seo);
  const title = `${collection.title} — ${page.studioName}`;
  return {
    title,
    description: collection.subtitle ?? seo.description ?? `A curated collection by ${page.studioName}.`,
    alternates: { canonical: collectionUrl(page.ctx, cslug) === `${PUBLIC_ORIGIN}/portfolio/${slug}/c/${cslug}` ? undefined : collectionUrl(page.ctx, cslug) },
    openGraph: {
      title,
      url: collectionUrl(page.ctx, cslug),
      images: collection.coverImage ? [{ url: `${page.ctx.origin}${collection.coverImage}` }] : undefined,
    },
  };
}

export default async function PortfolioCollectionPage({
  params,
}: {
  params: Promise<{ slug: string; cslug: string }>;
}) {
  const { slug, cslug } = await params;
  if (!SLUG_RE.test(slug) || !SLUG_RE.test(cslug)) notFound();
  const page = await resolvePublicPortfolioPage(slug, requestHost(await headers()) ?? "");
  if (!page) notFound();
  const collection = page.portfolio.collections.find((c) => c.slug === cslug);
  if (!collection) notFound();

  const t = { ...DEFAULT_PORTFOLIO_THEME, ...page.theme };
  const vars = portfolioThemeCss(page.theme) as Record<string, string>;
  if (t.font) vars["--pf-font"] = fontFamilyOf(t.font) ?? "";

  return (
    <div className="min-h-screen" style={vars}>
      {t.font ? <link rel="stylesheet" href={FONTS_CSS_HREF} /> : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(imageGalleryJsonLd(page.ctx, collection, page.studioName)),
        }}
      />
      <main
        className="mx-auto w-full max-w-6xl px-6 py-12 text-[var(--pf-text)]"
        style={{
          background: "var(--pf-bg)",
          fontFamily: "var(--pf-font, ui-sans-serif, system-ui, sans-serif)",
          letterSpacing: "var(--pf-tracking)",
          fontSize: t.fontScale !== undefined ? `calc(1rem * ${t.fontScale})` : undefined,
        }}
      >
        <p className="text-xs uppercase tracking-widest opacity-60">
          <a href={`/portfolio/${page.portfolio.slug}`} className="underline">
            {page.studioName}
          </a>
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{collection.title}</h1>
        {collection.subtitle ? <p className="mt-2 opacity-70">{collection.subtitle}</p> : null}
        <div className="mt-10">
          {page.overBudget ? (
            <div
              className="mx-auto max-w-md p-8 text-center"
              style={{ background: "var(--pf-surface)", borderRadius: "var(--pf-radius)" }}
            >
              <h2 className="text-lg font-medium">Temporarily unavailable</h2>
              <p className="mt-2 text-sm opacity-70">
                This portfolio is taking a short break. Please check back soon.
              </p>
            </div>
          ) : (
            <PortfolioGrid
              items={collection.items.map((i) => ({
                assetId: i.assetId,
                image: i.image,
                caption: i.caption,
                altText: i.altText,
                width: i.width,
                height: i.height,
              }))}
              captions={t.captions ?? "hover"}
              radius={t.radius ?? "16px"}
            />
          )}
        </div>
      </main>
      {page.showBadge ? (
        <a
          href={PUBLIC_ORIGIN}
          className="fixed bottom-3 right-3 z-40 rounded-full bg-black/70 px-3 py-1.5 text-[11px] text-white backdrop-blur hover:bg-black/85"
        >
          Delivered by <span className="font-semibold">Snap</span>
        </a>
      ) : null}
    </div>
  );
}
