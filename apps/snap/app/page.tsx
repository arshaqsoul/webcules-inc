import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { BridgeChapter } from "@/components/landing/bridge";
import { BentoFeatures } from "@/components/landing/bento";
import { CrawlChapter } from "@/components/landing/crawl";
import { FamilyChapter, TownChapter, WeddingChapter, WildChapter } from "@/components/landing/story-chapters";
import { FilmGrain } from "@/components/landing/film-grain";
import { FinalCta } from "@/components/landing/final-cta";
import { HeroDive } from "@/components/landing/hero-dive";
import { LandingNav } from "@/components/landing/landing-nav";
import { MarqueeSection } from "@/components/landing/marquee";
import { PricingSection } from "@/components/landing/pricing-section";
import { SmoothScroll } from "@/components/landing/smooth-scroll";
import { StackMath } from "@/components/landing/stack-math";
import { isCustomAppHost } from "@/lib/domains";
import { resolveStudioByHost } from "@/lib/repos/domains";
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
 * The cinematic landing — a scroll-driven story (the wild → the city → a
 * wedding → a first year) that lands on the product. Chrome + typography
 * stay inside the Linear-derived system; the photography carries the cinema.
 */
export default async function Home() {
  // WEB-227: a studio's custom hostname IS the client surface — `/` there is
  // the studio's booking page, not our marketing landing. Unknown hosts (no
  // active domain row) get a neutral 404: no tenant data by hostname alone.
  const host = (await headers()).get("host");
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
        <FilmGrain />
        <LandingNav signedIn={!!user} />
        <main>
          <HeroDive signedIn={!!user} />
          <CrawlChapter />
          <WildChapter />
          <TownChapter />
          <WeddingChapter />
          <FamilyChapter />
          <BridgeChapter />
          <MarqueeSection />
          <BentoFeatures />
          <StackMath />
          <PricingSection />
          <FinalCta signedIn={!!user} />
        </main>
      </SmoothScroll>
    </>
  );
}
