/* /learn chrome — the docs shell's sibling: same fixed rail (the sidebar is
 * pathname-aware and switches to the learn series), slim breadcrumb header.
 * Public (no auth). */
import type { Metadata } from "next";

import { DocsSidebar } from "@/components/docs/sidebar";
import { LearnHeader } from "@/components/learn/learn-header";

export const metadata: Metadata = {
  title: { absolute: "Snap learn" },
  description: "Video guides for running your photography studio on Snap.",
};

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <DocsSidebar />
      <div className="lg:pl-[280px]">
        <LearnHeader />
        <main>{children}</main>
      </div>
    </div>
  );
}
