/* Public portfolio home — /portfolio/{slug} (WEB-346, Feature A). SSR from
 * D1 on every request: a site only exists publicly when PUBLISHED; draft and
 * unlisted 404 (AC1), and a Free org past its 100k image-view budget renders
 * the neutral cap card instead of the gallery (AC3 — never a 500). SEO is
 * part of the surface: SSR HTML, JSON-LD LocalBusiness, OG via /api/pubimg
 * and a per-site sitemap.xml (AC5). */
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { resolvePublicPortfolioPage, type PublicPortfolioPage } from "@/lib/portfolio-page";
import {
  collectionUrl,
  localBusinessJsonLd,
  parsePortfolioSeo,
  portfolioSections,
} from "@/lib/portfolio-seo";
import {
  DEFAULT_PORTFOLIO_THEME,
  portfolioThemeCss,
  type AboutSection,
  type ContactSection,
  type HeroSection,
  type CollectionsSection,
} from "@/lib/portfolio-theme";
import { requestHost } from "@/lib/domains";
import { PUBLIC_ORIGIN } from "@/lib/hosts";
import { fontFamilyOf, FONTS_CSS_HREF } from "@/lib/fonts";

export const dynamic = "force-dynamic";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return {};
  const page = await resolvePublicPortfolioPage(slug, requestHost(await headers()) ?? "");
  if (!page) return { robots: { index: false } };
  const seo = parsePortfolioSeo(page.portfolio.seo);
  const title = seo.title ? `${seo.title}` : `${page.studioName} — Photography Portfolio`;
  return {
    title,
    description: seo.description ?? `Portrait, wedding and event photography by ${page.studioName}.`,
    alternates: { canonical: page.ctx.origin === PUBLIC_ORIGIN ? undefined : page.ctx.origin },
    openGraph: {
      title,
      description: seo.description ?? undefined,
      url: `${page.ctx.origin}/portfolio/${page.portfolio.slug}`,
      images: page.ctx.ogImage ? [{ url: page.ctx.ogImage }] : undefined,
    },
  };
}

export default async function PortfolioHomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) notFound();
  const page = await resolvePublicPortfolioPage(slug, requestHost(await headers()) ?? "");
  if (!page) notFound();

  const t = { ...DEFAULT_PORTFOLIO_THEME, ...page.theme };
  const vars = portfolioThemeCss(page.theme) as Record<string, string>;
  if (t.font) vars["--pf-font"] = fontFamilyOf(t.font) ?? "";
  const sections = portfolioSections(page.portfolio);
  const allItems = page.portfolio.collections.flatMap((c) => c.items);
  const heroImageFor = (s: HeroSection) =>
    (s.assetId && allItems.find((i) => i.assetId === s.assetId)?.image) ||
    page.portfolio.collections[0]?.coverImage ||
    null;

  return (
    <div
      className="min-h-screen"
      style={vars}
    >
      {t.font ? (
        <link rel="stylesheet" href={FONTS_CSS_HREF} />
      ) : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd(page.ctx, page.portfolio)) }}
      />
      <main
        className="mx-auto w-full max-w-6xl text-[var(--pf-text)]"
        style={{
          background: "var(--pf-bg)",
          fontFamily: "var(--pf-font, ui-sans-serif, system-ui, sans-serif)",
          letterSpacing: "var(--pf-tracking)",
          fontSize: t.fontScale !== undefined ? `calc(1rem * ${t.fontScale})` : undefined,
        }}
      >
        {page.overBudget ? (
          <CapCard />
        ) : (
          sections.map((section, i) => {
            if (section.type === "hero") {
              return <Hero key={i} section={section} page={page} image={heroImageFor(section)} />;
            }
            if (section.type === "collections") {
              return <Collections key={i} section={section} page={page} />;
            }
            if (section.type === "about") {
              return <About key={i} section={section} page={page} />;
            }
            return <Contact key={i} section={section} page={page} />;
          })
        )}
      </main>
      {page.showBadge ? <SnapBadge /> : null}
    </div>
  );
}

function Hero({
  section,
  page,
  image,
}: {
  section: HeroSection;
  page: PublicPortfolioPage;
  image: string | null;
}) {
  // No explicit hero CTA configured: the photographer's goal defaults to
  // booking (WEB-304 §A2 "Goal decides CTA prominence").
  const cta = section.cta ?? (page.bookingHref ? { label: "Book a session", href: page.bookingHref } : undefined);
  return (
    <section className="relative flex min-h-[70vh] flex-col items-center justify-center overflow-hidden px-6 text-center">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt={section.subtitle || page.studioName}
          className="absolute inset-0 h-full w-full object-cover opacity-70"
        />
      ) : null}
      <div className="relative z-10 py-16" style={{ padding: "var(--pf-pad)" }}>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
          {section.title || page.studioName}
        </h1>
        {section.subtitle ? (
          <p className="mx-auto mt-4 max-w-xl text-base opacity-75 sm:text-lg">{section.subtitle}</p>
        ) : null}
        {cta ? (
          <a
            href={cta.href}
            className="mt-8 inline-block rounded px-7 py-3 text-sm font-medium"
            style={{
              background: "var(--pf-accent)",
              color: "var(--pf-bg)",
              borderRadius: "var(--pf-radius)",
            }}
          >
            {cta.label}
          </a>
        ) : null}
      </div>
    </section>
  );
}

function Collections({
  section,
  page,
}: {
  section: CollectionsSection;
  page: PublicPortfolioPage;
}) {
  if (!page.portfolio.collections.length) return null;
  return (
    <section id="work" className="px-6 py-16" style={{ padding: "var(--pf-pad)" }}>
      <h2 className="mb-8 text-2xl font-semibold tracking-tight">
        {section.title || "Selected work"}
      </h2>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {page.portfolio.collections.map((c) => (
          <a
            key={c.slug}
            href={collectionUrl(page.ctx, c.slug)}
            className="group block overflow-hidden bg-[var(--pf-surface)]"
            style={{ borderRadius: "var(--pf-radius)" }}
          >
            {c.coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.coverImage}
                alt={c.title}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              />
            ) : null}
            <div className="p-4">
              <h3 className="font-medium">{c.title}</h3>
              {c.subtitle ? <p className="mt-1 text-sm opacity-70">{c.subtitle}</p> : null}
              <p className="mt-1 text-xs opacity-60">{c.items.length} photos</p>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

function About({ section, page }: { section: AboutSection; page: Awaited<ReturnType<typeof resolvePublicPortfolioPage>> }) {
  if (!section.text) return null;
  return (
    <section id="about" className="px-6 py-16" style={{ padding: "var(--pf-pad)" }}>
      <h2 className="mb-6 text-2xl font-semibold tracking-tight">{section.title || "About"}</h2>
      <p className="max-w-2xl whitespace-pre-line leading-relaxed opacity-85">{section.text}</p>
    </section>
  );
}

function Contact({ section, page }: { section: ContactSection; page: PublicPortfolioPage }) {
  return (
    <section id="contact" className="px-6 py-16" style={{ padding: "var(--pf-pad)" }}>
      <h2 className="mb-6 text-2xl font-semibold tracking-tight">{section.title || "Contact"}</h2>
      {section.blurb ? <p className="mb-4 max-w-2xl opacity-85">{section.blurb}</p> : null}
      <div className="flex flex-wrap items-center gap-4">
        {section.booking !== false && page.bookingHref ? (
          <a
            href={page.bookingHref}
            className="rounded px-6 py-3 text-sm font-medium"
            style={{ background: "var(--pf-accent)", color: "var(--pf-bg)", borderRadius: "var(--pf-radius)" }}
          >
            Book a session
          </a>
        ) : null}
        {page.contactEmail ? (
          <a href={`mailto:${page.contactEmail}`} className="text-sm underline opacity-80">
            {page.contactEmail}
          </a>
        ) : null}
      </div>
    </section>
  );
}

/** WEB-304 §5: the Free budget-pause state — a neutral card. Never an error
 * page, never an upsell to a visitor (WEB-346 AC3). */
function CapCard() {
  return (
    <section className="flex min-h-[70vh] items-center justify-center px-6">
      <div
        className="max-w-md p-8 text-center"
        style={{ background: "var(--pf-surface)", borderRadius: "var(--pf-radius)" }}
      >
        <h1 className="text-xl font-medium">Temporarily unavailable</h1>
        <p className="mt-3 text-sm opacity-70">
          This portfolio is taking a short break. Please check back soon.
        </p>
      </div>
    </section>
  );
}

function SnapBadge() {
  return (
    <a
      href={PUBLIC_ORIGIN}
      className="fixed bottom-3 right-3 z-40 rounded-full bg-black/70 px-3 py-1.5 text-[11px] text-white backdrop-blur hover:bg-black/85"
    >
      Delivered by <span className="font-semibold">Snap</span>
    </a>
  );
}
