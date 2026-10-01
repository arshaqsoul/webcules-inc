"use client";
/* /learn header — slim bar with the series breadcrumb (Getting started /
 * <guide>), mirroring the docs header's geometry. */
import Link from "next/link";
import { usePathname } from "next/navigation";

import { findLearnGuide, LEARN_GUIDES } from "@/lib/learn/nav";

export function LearnHeader() {
  const pathname = usePathname();
  const slug = pathname.startsWith("/learn/") ? pathname.slice("/learn/".length) : "";
  const guide = slug ? findLearnGuide(slug) : undefined;

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-hairline bg-canvas/90 px-4 backdrop-blur lg:px-8">
      <span className="flex items-center gap-2 text-[13.5px] text-ink-subtle">
        {LEARN_GUIDES.length > 0 && <span>Getting started</span>}
        {guide && (
          <>
            <span aria-hidden className="text-ink-tertiary">
              /
            </span>
            <span className="font-medium text-ink">{guide.title}</span>
          </>
        )}
      </span>
      <Link
        href="/docs"
        className="ml-auto rounded-md border border-hairline px-3 py-1.5 text-[13px] text-ink-subtle transition-colors hover:bg-surface-1 hover:text-ink"
      >
        Documentation
      </Link>
    </header>
  );
}
