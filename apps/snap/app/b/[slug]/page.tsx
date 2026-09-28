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
      logoKey: schema.studioProfiles.logoKey,
      embedKey: schema.studioProfiles.embedKey,
      contactEmail: schema.studioProfiles.contactEmail,
    })
    .from(schema.studioProfiles)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.studioProfiles.organizationId))
    .where(eq(schema.organization.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const studio = await studioBySlug(slug);
  if (!studio) return { title: "Book a session" };
  return {
    title: `Book ${studio.studioName}`,
    description: `See availability and book a session with ${studio.studioName}.`,
    robots: { index: false },
    openGraph: {
      title: `Book ${studio.studioName}`,
      description: `See availability and book a session with ${studio.studioName}.`,
      ...(studio.logoKey ? { images: [`/api/embed/logo?key=${studio.embedKey}`] } : {}),
    },
  };
}

export default async function PublicBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (RESERVED_SLUGS.has(slug)) notFound();
  const studio = await studioBySlug(slug);
  if (!studio || !studio.embedKey) notFound();

  const brand = JSON.parse(studio.brand || "{}") as { accent?: string; fontFamily?: string; theme?: string; tokens?: Record<string, string> };
  const accent = safeHexColor(brand.accent) ?? "#5e6ad2";

  // Brand-layer tokens flow into the widget via query params (server
  // sanitizes again inside the widget route).
  const tokenQuery = new URLSearchParams();
  if (brand.theme === "dark" || brand.theme === "light") tokenQuery.set("theme", brand.theme);
  if (brand.fontFamily) tokenQuery.set("fontFamily", brand.fontFamily);
  for (const [k, v] of Object.entries(brand.tokens ?? {})) {
    if (typeof v === "string" && tokenQuery.size < 8) tokenQuery.set(k, v);
  }
  const widgetSrc = `/embed/calendar?key=${studio.embedKey}${tokenQuery.size ? `&${tokenQuery}` : ""}`;

  return (
    <main className="flex min-h-screen flex-col items-center px-4 py-8 sm:py-12" style={{ background: `color-mix(in srgb, ${accent} 6%, #fafafa)` }}>
      <div className="w-full max-w-3xl">
        <div className="mb-4 flex flex-col items-center gap-2 text-center">
          {studio.logoKey ? (
            // eslint-disable-next-line @next/next/no-img-element -- branded logo via authorized proxy
            <img src={`/api/embed/logo?key=${studio.embedKey}`} alt={studio.studioName} className="max-h-12 max-w-56 object-contain" />
          ) : (
            <p className="text-xl font-semibold tracking-[-0.4px] text-[#0f1011]">{studio.studioName}</p>
          )}
          <p className="text-sm text-[#62666d]">Pick a time that works for you — booking takes under a minute.</p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-[#e3e5e8] bg-white shadow-sm">
          <iframe
            title={`Book ${studio.studioName}`}
            src={widgetSrc}
            className="block h-[640px] w-full border-0"
            id="snap-booking-frame"
          />
        </div>
        <p className="mt-4 text-center text-xs text-[#8a8f98]">
          Bookings handled securely by {studio.studioName} via Snap
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
