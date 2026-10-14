import type { Metadata } from "next";

import { cn } from "@webcules/ui/lib/utils";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Instrument_Serif } from "next/font/google";
import React from "react";

import { AdminBar } from "@webcules/payload/components/AdminBar/index";
import { MetaPixel } from "@/components/analytics/meta-pixel";
import { WebculesNav } from "@/components/shared/webcules-nav";
import { Footer } from "@/components/shared/footer";
import { Providers } from "@webcules/payload/providers/index";
import { mergeOpenGraph } from "@webcules/payload/utilities/mergeOpenGraph";
import { draftMode } from "next/headers";

import "@webcules/ui/globals.css";
import "./landing.css";

const display = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-display",
});

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isEnabled } = await draftMode();

  return (
    <html
      className={cn(GeistSans.variable, GeistMono.variable, display.variable)}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <link href="/favicon.ico" rel="icon" sizes="32x32" />
        <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
      </head>
      <body className="theme-dark bg-darkest text-white antialiased">
        <MetaPixel />
        <Providers>
          <AdminBar
            adminBarProps={{
              preview: isEnabled,
            }}
          />

          {/* The fixed header (WebculesNav) serves both the top and scrolled
              states — one navbar, always in sync. */}
          <WebculesNav />
          {children}
          <Footer />
        </Providers>
      </body>
    </html>
  );
}

export const metadata: Metadata = {
  // Deterministic production origin — never localhost: OG/Twitter image URLs
  // resolve against metadataBase. (NEXT_PUBLIC_BASE_URL is set in wrangler
  // vars for the deployed worker; the literal keeps local builds sane too.)
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "https://webcules.com"),
  // The shared mergeOpenGraph() default builds an absolute image URL from
  // NEXT_PUBLIC_SERVER_URL (the CMS origin, or localhost locally). Override
  // with a metadataBase-relative URL so OG images always resolve against the
  // site origin above.
  openGraph: {
    ...mergeOpenGraph(),
    images: [{ url: "/opengraph-image.png" }],
  },
  twitter: {
    card: "summary_large_image",
    creator: "@arshaq",
    images: [{ url: "/opengraph-image.png" }],
  },
};

// All marketing content is CMS-driven; render per request on Cloudflare Workers
// (no build-time database access, always-fresh content).
export const dynamic = "force-dynamic";
