import type { Metadata } from "next";

import { cn } from "@webcules/ui/lib/utils";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import React from "react";

import { AdminBar } from "@webcules/payload/components/AdminBar/index";
import { WebculesFloatingNav } from "@/components/shared/webcules-floating-navbar";
import { WebculesNav } from "@/components/shared/webcules-nav";
import { Footer } from "@/components/shared/footer";
import { Providers } from "@webcules/payload/providers/index";
import { mergeOpenGraph } from "@webcules/payload/utilities/mergeOpenGraph";
import { draftMode } from "next/headers";

import "@webcules/ui/globals.css";
import { getServerSideURL } from "@webcules/payload/utilities/getURL";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isEnabled } = await draftMode();

  return (
    <html
      className={cn(GeistSans.variable, GeistMono.variable)}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <link href="/favicon.ico" rel="icon" sizes="32x32" />
        <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
      </head>
      <body>
        <Providers>
          <AdminBar
            adminBarProps={{
              preview: isEnabled,
            }}
          />

          <WebculesFloatingNav />
          <WebculesNav />
          {children}
          <Footer />
        </Providers>
      </body>
    </html>
  );
}

export const metadata: Metadata = {
  metadataBase: new URL(getServerSideURL()),
  openGraph: mergeOpenGraph(),
  twitter: {
    card: "summary_large_image",
    creator: "@arshaq",
  },
};
