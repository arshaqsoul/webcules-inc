import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { BentoFeatures } from "@/components/landing/bento";
import { ClientApp } from "@/components/landing/client-app";
import { Faq } from "@/components/landing/faq";
import { FinalCta } from "@/components/landing/final-cta";
import { Hero } from "@/components/landing/hero";
import { LandingNav } from "@/components/landing/landing-nav";
import { MasonryWall } from "@/components/landing/masonry-wall";
import { Personas } from "@/components/landing/personas";
import { PricingSection } from "@/components/landing/pricing-section";
import { ProductTour } from "@/components/landing/product-tour";
import { SmoothScroll } from "@/components/landing/smooth-scroll";
import { StackMath } from "@/components/landing/stack-math";
import { TemplateGridSection } from "@/components/landing/template-grid";
import { TrustStrip } from "@/components/landing/trust-strip";
import { isCustomAppHost } from "@/lib/domains";
import { resolveStudioByHost } from "@/lib/repos/domains";
import { requestHost } from "@/lib/domains";
import { getStudioSlug } from "@/lib/repos/studios";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Snap — Your studio, in focus. The platform for photographers",
  description:
    "From first light to first steps: booking, pipelines, vault-grade client galleries, contracts and payouts to your own Stripe. One login, one bill, zero commission.",
  openGraph: {
    title: "Snap — Your studio, in focus.",
    description:
      "The studio platform for photographers. Booking, galleries, contracts, payments — 0% commission, 20 GB free.",
    images: ["/imgs/landing/scenery-peak.jpg"],
  },
};

/**
 * The marketing landing — product-first: a hero with the product already
 * running, an animated photo wall, a sticky product tour of looping replays,
 * a tappable client phone, persona tabs, the feature bento, pricing and FAQ.
 * Chrome + typography stay inside the Linear-derived system.
 */
export default async function Home() {
  // WEB-227: a studio's custom hostname IS the client surface — `/` there is
  // the studio's booking page, not our marketing landing. Unknown hosts (no
  // active domain row) get a neutral 404: no tenant data by hostname alone.
  const host = requestHost(await headers());
  if (host && isCustomAppHost(host)) {
    const studio = await resolveStudioByHost(host);
    if (studio) {
      const slug = await getStudioSlug(studio.organizationId);
      if (slug) redirect(`/b/${slug}`);
    }
    notFound();
  }

  const user = await getSessionUser();

  return (
    <>
      {/* Display serif for the story voice; React hoists these into <head>. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />

      <SmoothScroll>
        <LandingNav signedIn={!!user} />
        <main>
          <Hero signedIn={!!user} />
          <TrustStrip />
          <MasonryWall />
          <ProductTour />
          <ClientApp />
          <Personas />
          <TemplateGridSection />
          <BentoFeatures />
          <StackMath />
          <PricingSection />
          <Faq />
          <FinalCta signedIn={!!user} />
        </main>
      </SmoothScroll>
    </>
  );
}
