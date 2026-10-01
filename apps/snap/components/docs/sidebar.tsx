"use client";

/* Docs sidebar — Linear's docs chrome: fixed 280px rail, collapsible
 * categories whose child pages carry icons, search trigger up top, utility
 * links pinned at the bottom. The active page's category is expanded by
 * default; every category can still be folded manually. Mobile: the header's
 * hamburger opens this as an overlay (via the docs-sidebar event).
 * On /learn/* the rail switches to the learn series (video guides). */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, ChevronRight, LifeBuoy, PlayCircle, Search, X } from "lucide-react";

import { DOC_CATEGORIES } from "@/lib/docs/nav";
import { LEARN_GUIDES, fmt } from "@/lib/learn/nav";
import { SnapMark } from "@/components/snap-mark";

import { DocIcon } from "./icons";
import { openDocsSearch } from "./search";

export function DocsSidebar() {
  const pathname = usePathname();
  const isLearn = pathname === "/learn" || pathname.startsWith("/learn/");
  const slug = pathname.startsWith("/docs/") ? pathname.slice("/docs/".length).replace(/\/$/, "") : "";
  const learnSlug = isLearn && pathname.startsWith("/learn/") ? pathname.slice("/learn/".length).replace(/\/$/, "") : "";
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [mobileOpen, setMobileOpen] = useState(false);

  // Header hamburger (mobile) opens the rail as an overlay.
  useEffect(() => {
    const onOpen = () => setMobileOpen(true);
    window.addEventListener("docs-sidebar", onOpen);
    return () => window.removeEventListener("docs-sidebar", onOpen);
  }, []);
  // Route change closes the mobile overlay.
  useEffect(() => setMobileOpen(false), [pathname]);

  const open = (id: string) => {
    // Linear behavior: categories are folded unless they contain the active
    // page; a manual toggle overrides until toggled back.
    const manual = folded[id];
    if (manual === undefined) return containsActive(id);
    return manual;
  };
  const containsActive = (id: string) =>
    DOC_CATEGORIES.find((c) => c.id === id)?.pages.some((p) => p.slug === slug) ?? false;

  return (
    <>
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[280px] flex-col border-r border-hairline bg-canvas lg:flex">
        <SidebarBody slug={slug} learnSlug={learnSlug} isLearn={isLearn} open={open} containsActive={containsActive} toggle={toggle} />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close docs menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[300px] flex-col border-r border-hairline bg-canvas shadow-xl">
            <div className="flex h-16 items-center px-4">
              <span className="flex items-center gap-2">
                <SnapMark className="h-6 w-6" />
                <span className="text-[15px] font-semibold tracking-[-0.2px] text-ink">
                  {isLearn ? "Snap learn" : "Snap docs"}
                </span>
              </span>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
                className="ml-auto rounded-md p-1.5 text-ink-subtle hover:bg-surface-2 hover:text-ink"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <SidebarBody
              slug={slug}
              learnSlug={learnSlug}
              isLearn={isLearn}
              open={open}
              containsActive={containsActive}
              toggle={toggle}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}
    </>
  );

  function toggle(id: string) {
    setFolded((f) => ({ ...f, [id]: !open(id) }));
  }
}

function SidebarBody({
  slug,
  learnSlug,
  isLearn,
  open,
  containsActive,
  toggle,
  onNavigate,
}: {
  slug: string;
  learnSlug: string;
  isLearn: boolean;
  open: (id: string) => boolean;
  containsActive: (id: string) => boolean;
  toggle: (id: string) => void;
  onNavigate?: () => void;
}) {
  return (
    <>
      {/* Logo + search */}
      <div className="flex h-16 shrink-0 items-center gap-2 px-4">
        <Link href={isLearn ? "/learn" : "/docs"} onClick={onNavigate} className="flex items-center gap-2 rounded-md">
          <SnapMark className="h-6 w-6" />
          <span className="text-[15px] font-semibold tracking-[-0.2px] text-ink">
            {isLearn ? "Snap learn" : "Snap docs"}
          </span>
        </Link>
        <button
          type="button"
          onClick={openDocsSearch}
          aria-label="Search documentation"
          title="Search docs (⌘K)"
          className="ml-auto rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <Search className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* Nav — learn series on /learn, doc categories on /docs */}
      <nav className="flex-1 overflow-y-auto px-3 pb-6 pt-3" aria-label={isLearn ? "Learn" : "Documentation"}>
        {isLearn ? (
          <div className="mb-0.5">
            <p className="flex w-full items-center gap-2 rounded-md px-2.5 py-[7px] text-[13.5px] font-medium text-ink">
              Getting started
            </p>
            <div className="mb-1.5 flex flex-col">
              {LEARN_GUIDES.map((g) => {
                const active = g.slug === learnSlug;
                return (
                  <Link
                    key={g.slug}
                    href={`/learn/${g.slug}`}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`ml-[18px] flex items-center gap-2.5 rounded-md py-[6px] pl-3.5 pr-2.5 text-[13.5px] transition-colors ${
                      active ? "bg-surface-2 font-medium text-ink" : "text-ink-subtle hover:text-ink"
                    }`}
                  >
                    <PlayCircle className="h-[15px] w-[15px] shrink-0 text-ink-tertiary" />
                    <span className="min-w-0 flex-1 truncate">{g.title}</span>
                    <span className="shrink-0 text-[11.5px] tabular-nums text-ink-tertiary">{fmt(g.seconds)}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            {DOC_CATEGORIES.map((category) => {
              const expanded = open(category.id);
              return (
                <div key={category.id} className="mb-0.5">
                  <button
                    type="button"
                    onClick={() => toggle(category.id)}
                    aria-expanded={expanded}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-[7px] text-left text-[13.5px] transition-colors ${
                      containsActive(category.id) ? "font-medium text-ink" : "text-ink-muted hover:text-ink"
                    } hover:bg-surface-1`}
                  >
                    <ChevronRight
                      className={`h-3.5 w-3.5 shrink-0 text-ink-tertiary transition-transform ${expanded ? "rotate-90" : ""}`}
                      aria-hidden
                    />
                    {category.label}
                  </button>
                  {expanded && (
                    <div className="mb-1.5 flex flex-col">
                      {category.pages.map((page) => {
                        const active = page.slug === slug;
                        return (
                          <Link
                            key={page.slug}
                            href={`/docs/${page.slug}`}
                            onClick={onNavigate}
                            aria-current={active ? "page" : undefined}
                            className={`ml-[18px] flex items-center gap-2.5 rounded-md py-[6px] pl-3.5 pr-2.5 text-[13.5px] transition-colors ${
                              active ? "bg-surface-2 font-medium text-ink" : "text-ink-subtle hover:text-ink"
                            }`}
                          >
                            <DocIcon icon={page.icon} className="h-[15px] w-[15px] shrink-0 text-ink-tertiary" />
                            <span className="min-w-0 flex-1 truncate">{page.title}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </nav>

      {/* Utility links */}
      <div className="shrink-0 border-t border-hairline p-2">
        <Link
          href="/docs"
          className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] transition-colors ${
            isLearn ? "text-ink-subtle hover:bg-surface-1 hover:text-ink" : "bg-surface-2 font-medium text-ink"
          }`}
        >
          <BookOpen className="h-4 w-4 shrink-0 text-ink-tertiary" aria-hidden />
          Docs
        </Link>
        <Link
          href="/learn"
          className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] transition-colors ${
            isLearn ? "bg-surface-2 font-medium text-ink" : "text-ink-subtle hover:bg-surface-1 hover:text-ink"
          }`}
        >
          <PlayCircle className="h-4 w-4 shrink-0 text-ink-tertiary" aria-hidden />
          Learn
        </Link>
        <a
          href="mailto:hello@snap.webcules.com"
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] text-ink-subtle transition-colors hover:bg-surface-1 hover:text-ink"
        >
          <LifeBuoy className="h-4 w-4 shrink-0 text-ink-tertiary" aria-hidden />
          Contact support
        </a>
      </div>
    </>
  );
}
