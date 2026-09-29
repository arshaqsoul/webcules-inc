/* Public booking page /b/{slug} (WEB-165) — a standalone branded page for
 * photographers who want a shareable link (bio links, Instagram, email
 * signatures) instead of an embed. Reuses the calendar widget 1:1 inside a
 * first-party same-origin iframe: identical availability/booking APIs,
 * Turnstile, theming tokens, plan gates and payment flow. Concurrency is
 * arbitrated exactly like the widget (see the WEB-165 analysis comment):
 * live D1 slot computation + server re-validation + the partial unique
 * index as the race-proof guard. */
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { isWhiteLabeled } from "@/lib/branding";
import { brandIcons, brandOgImage, parseBrandAssets } from "@/lib/brand-assets";
import { getPlanEntitlements } from "@/lib/plans";
import { parseBookingPageConfig } from "@/lib/booking-page";
import { safeHexColor } from "@/lib/embed";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false } };

const RESERVED_SLUGS = new Set(["login", "signup", "onboarding", "dashboard", "portal", "embed", "api", "g", "inv", "c", "b"]);

async function studioBySlug(slug: string) {
  const rows = await getDb()
    .select({
      organizationId: schema.studioProfiles.organizationId,
      studioName: schema.studioProfiles.studioName,
      brand: schema.studioProfiles.brand,
      brandAssets: schema.studioProfiles.brandAssets,
      logoKey: schema.studioProfiles.logoKey,
      embedKey: schema.studioProfiles.embedKey,
      contactEmail: schema.studioProfiles.contactEmail,
      bookingPage: schema.studioProfiles.bookingPage,
    })
    .from(schema.studioProfiles)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.studioProfiles.organizationId))
    .where(eq(schema.organization.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

/** WEB-238: effective white-label flag for this studio (entitlement AND toggle). */
async function studioWhiteLabeled(studio: { organizationId: string; brand: string } | null): Promise<boolean> {
  if (!studio) return false;
  return isWhiteLabeled(await getPlanEntitlements(studio.organizationId), studio.brand);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const studio = await studioBySlug(slug);
  if (!studio) return { title: "Book a session" };
  const title = `Book ${studio.studioName}`;
  const metaPage = parseBookingPageConfig(studio.bookingPage ?? null);
  // WEB-238: white-labeled — absolute title skips the `· Snap` template suffix.
  const wl = await studioWhiteLabeled(studio);
  const bag = parseBrandAssets(studio.brandAssets);
  const icons = brandIcons(bag, studio.organizationId);
  const ogImage = brandOgImage(bag, studio.organizationId);
  return {
    title: wl ? { absolute: title } : title,
    description: metaPage.hero.subtitle || `See availability and book a session with ${studio.studioName}.`,
    robots: { index: false },
    ...(icons ? { icons } : {}),
    openGraph: {
      title,
      description: metaPage.hero.subtitle || `See availability and book a session with ${studio.studioName}.`,
      images: [
        ...(ogImage ? [ogImage] : []),
        ...(studio.logoKey && !ogImage ? [`/api/embed/logo?key=${studio.embedKey}`] : []),
      ],
    },
  };
}

export default async function PublicBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { slug } = await params;
  const typeSlug = ((await searchParams).type ?? "").replace(/[^a-z0-9-]/gi, "").slice(0, 40);
  if (RESERVED_SLUGS.has(slug)) notFound();
  const studio = await studioBySlug(slug);
  if (!studio || !studio.embedKey) notFound();

  const brand = JSON.parse(studio.brand || "{}") as { accent?: string; fontFamily?: string; theme?: string; tokens?: Record<string, string> };
  const accent = safeHexColor(brand.accent) ?? "#5e6ad2";
  const wl = await studioWhiteLabeled(studio);
  const page = parseBookingPageConfig(studio.bookingPage ?? null);

  // Brand-layer tokens flow into the widget via query params (server
  // sanitizes again inside the widget route).
  const tokenQuery = new URLSearchParams();
  if (brand.theme === "dark" || brand.theme === "light") tokenQuery.set("theme", brand.theme);
  if (brand.fontFamily) tokenQuery.set("fontFamily", brand.fontFamily);
  for (const [k, v] of Object.entries(brand.tokens ?? {})) {
    if (typeof v === "string" && tokenQuery.size < 8) tokenQuery.set(k, v);
  }
  if (typeSlug) tokenQuery.set("type", typeSlug);
  const widgetSrc = `/embed/calendar?key=${studio.embedKey}${tokenQuery.size ? `&${tokenQuery}` : ""}`;

  return (
    <main className="flex min-h-screen flex-col items-center px-4 py-8 sm:py-12" style={{ background: `color-mix(in srgb, ${accent} 6%, #fafafa)` }}>
      <div className="w-full max-w-5xl">
        <div className="mb-4 flex flex-col items-center gap-2 text-center">
          {studio.logoKey ? (
            // eslint-disable-next-line @next/next/no-img-element -- branded logo via authorized proxy
            <img src={`/api/embed/logo?key=${studio.embedKey}`} alt={studio.studioName} className="max-h-12 max-w-56 object-contain" />
          ) : (
            <p className="text-xl font-semibold tracking-[-0.4px] text-[#0f1011]">{studio.studioName}</p>
          )}
          {page.hero.title && !studio.logoKey ? (
            <p className="text-xl font-semibold tracking-[-0.4px] text-[#0f1011]">{page.hero.title}</p>
          ) : null}
          <p className="text-sm text-[#62666d]">{page.hero.subtitle || "Pick a time that works for you — booking takes under a minute."}</p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-[#e3e5e8] bg-white shadow-sm">
          <iframe
            title={`Book ${studio.studioName}`}
            src={widgetSrc}
            className="block h-[640px] w-full border-0"
            id="snap-booking-frame"
          />
        </div>
        {page.intro && (page.intro.heading || page.intro.body) && (
          <section className="mt-6 rounded-2xl border border-[#e3e5e8] bg-white p-6 shadow-sm">
            {page.intro.heading ? <h2 className="text-base font-semibold text-[#0f1011]">{page.intro.heading}</h2> : null}
            {page.intro.body ? <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[#3f4149]">{page.intro.body}</p> : null}
          </section>
        )}
        {page.faq.length > 0 && (
          <section className="mt-4 rounded-2xl border border-[#e3e5e8] bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-[#0f1011]">Good to know</h2>
            <div className="flex flex-col gap-2">
              {page.faq.map((f, i) => (
                <details key={i} className="group rounded-lg border border-[#eceef0] px-4 py-3">
                  <summary className="cursor-pointer list-none text-sm font-medium text-[#0f1011] marker:hidden">{f.q}</summary>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[#62666d]">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        )}
        {page.socials.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            {page.socials.map((soc, i) => (
              <a
                key={i}
                href={soc.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="rounded-full border border-[#e3e5e8] bg-white px-4 py-1.5 text-xs font-medium text-[#3f4149] shadow-sm hover:border-[#5e6ad2]"
              >
                {soc.kind === "website" ? "Website" : soc.kind === "email" ? "Email" : soc.kind.charAt(0).toUpperCase() + soc.kind.slice(1)}
              </a>
            ))}
          </div>
        )}
        <p className="mt-4 text-center text-xs text-[#8a8f98]">
          Bookings handled securely by {studio.studioName}
          {wl ? "" : " via Snap"}
          {studio.contactEmail ? (
            <>
              {" · "}
              <a href={`mailto:${studio.contactEmail}`} className="underline underline-offset-2">
                Questions? {studio.contactEmail}
              </a>
            </>
          ) : null}
        </p>
      </div>
      {/* The widget reports its height like any other host — grow/shrink the
       * frame with it (fixed h-[640px] only seeds the first paint). Same-origin
       * page, so the widget's referrer-derived target origin matches. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function () {
  window.addEventListener("message", function (e) {
    var f = document.getElementById("snap-booking-frame");
    if (!f || e.source !== f.contentWindow) return;
    var d = e.data || {};
    if (d.type === "snap:height" && typeof d.height === "number") {
      f.style.height = Math.max(420, Math.round(d.height) + 16) + "px";
    }
  });
})();`,
        }}
      />
    </main>
  );
}
