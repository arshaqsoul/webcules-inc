import type { Metadata } from "next";
import React from "react";

import { AdminBar } from "@webcules/payload/components/AdminBar/index";
import { WebculesFloatingNav } from "@/components/shared/webcules-floating-navbar";
import WebculesNav from "@/components/shared/webcules-nav";
import { Footer } from "@/components/shared/footer";
import { Providers } from "@webcules/payload/providers/index";
import { mergeOpenGraph } from "@webcules/payload/utilities/mergeOpenGraph";
import { draftMode } from "next/headers";

import "@webcules/ui/globals.css";
import { getServerSideURL } from "@webcules/payload/utilities/getURL";
import { CTASection } from "@/components/shared/cta-section";
import { Righteous } from "next/font/google";

const righteous = Righteous({ weight: ["400"], subsets: ["latin"] });

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isEnabled } = await draftMode();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link href="/favicon.ico" rel="icon" sizes="32x32" />
        <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
      </head>
      <body className={`no-scrollbar bg-darkest ${righteous.className}`}>
        <Providers>
          <AdminBar
            adminBarProps={{
              preview: isEnabled,
            }}
          />

          <WebculesFloatingNav />
          <WebculesNav />
          {children}
          <CTASection />
          <Footer />
        </Providers>
      </body>
    </html>
  );
}

export const metadata: Metadata = {
  metadataBase: new URL(`${process.env.NEXT_PUBLIC_APP_URL}`),
  openGraph: mergeOpenGraph({
    title:
      "Webcules Backgrounds | High-Quality Midjourney Design Backdrops for Creatives",
    description:
      "Explore Webcules Backgrounds, your source for high-quality design backdrops. Enhance your projects with a variety of stunning backgrounds, from ethereal fluid art to modern textures and beyond. Whether you're designing websites, presentations, or digital art, find the perfect backdrop to elevate your creativity. Discover the convenience of ready-to-use backgrounds and streamline your design process. Join today and access a wealth of inspiring visuals at background.webcules.com.",
    images: [
      {
        url: `${process.env.NEXT_PUBLIC_APP_URL}/opengraph-image.png`,
      },
    ],
  }),
  twitter: {
    card: "summary_large_image",
    creator: "@arshaq",
  },
};
