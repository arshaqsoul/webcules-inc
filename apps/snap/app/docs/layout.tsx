/* Snap docs — public documentation hub, Linear-style.
 * Fixed sidebar rail + sticky header + prose column + on-this-page rail.
 * Public (no auth); custom-studio hostnames 307 here (proxy.ts). */
import type { Metadata } from "next";

import "./docs.css";
import { DocsSidebar } from "@/components/docs/sidebar";
import { DocsHeader } from "@/components/docs/header";
import { DocsSearch } from "@/components/docs/search";
import { DocsLightbox } from "@/components/docs/lightbox";

export const metadata: Metadata = {
  title: { absolute: "Snap docs" },
  description: "Guides for running your photography studio on Snap — bookings, projects, galleries, and payments.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      {/* Inter for the docs chrome — the landing page loads it; the dashboard
       * inherits it from the OS. Docs is public, so load it explicitly. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <DocsSidebar />
      <div className="lg:pl-[280px]">
        <DocsHeader />
        <main>{children}</main>
      </div>
      <DocsSearch />
      <DocsLightbox />
    </div>
  );
}
