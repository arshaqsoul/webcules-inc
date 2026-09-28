import type { Metadata, Viewport } from "next";
import "./globals.css";

import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: {
    default: "Snap — Studio platform for photographers",
    template: "%s · Snap",
  },
  description:
    "Branded booking + inquiry widgets, project pipeline, secure client galleries, and payments — snap.webcules.com.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#010102" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* WEB-222: streamed-Suspense reveals are scheduled with
         * requestAnimationFrame (vinext's $RC batching) — but rAF NEVER fires
         * in tabs that aren't being composited (background tabs until
         * focused, and webviews like the in-app browser that report
         * visibilityState "visible" while drawing no frames). Pages opened
         * there would sit on their loading skeleton forever. The wrapper lets
         * the native frame win whenever frames exist, and fires a one-shot
         * timer chaser otherwise; cancelAnimationFrame stays honest by
         * clearing the chaser too, so animation loops keep native timing. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var o=window.requestAnimationFrame&&window.requestAnimationFrame.bind(window);if(!o)return;var oc=window.cancelAnimationFrame&&window.cancelAnimationFrame.bind(window);var ch=new Map();var n=1;window.requestAnimationFrame=function(c){var f=false,h=0;var run=function(){if(f)return;f=true;if(ch.has(h)){clearTimeout(ch.get(h));ch.delete(h)}c(performance.now())};var oh=o(run);h=oh||n++;ch.set(h,setTimeout(run,64));return h};window.cancelAnimationFrame=function(h){if(ch.has(h)){clearTimeout(ch.get(h));ch.delete(h)}if(oc)oc(h)}})();",
          }}
        />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
