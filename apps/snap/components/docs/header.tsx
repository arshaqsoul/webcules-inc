"use client";

/* Docs header — Linear's docs chrome: breadcrumb (Category / Page) left;
 * theme toggle, Copy page (with View-as-Markdown), and Open app right.
 * Below lg the hamburger replaces the breadcrumb and opens the sidebar. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Copy, Menu, Moon, Search, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { findDocPage } from "@/lib/docs/nav";

import { openDocsSearch } from "./search";

export function DocsHeader() {
  const pathname = usePathname();
  const slug = pathname.startsWith("/docs/") ? pathname.slice("/docs/".length).replace(/\/$/, "") : "";
  const hit = slug ? findDocPage(slug) : null;

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 bg-canvas/85 px-4 backdrop-blur lg:px-8">
      {/* Mobile: menu + search */}
      <button
        type="button"
        aria-label="Open docs menu"
        onClick={() => window.dispatchEvent(new CustomEvent("docs-sidebar"))}
        className="rounded-md p-1.5 text-ink-subtle hover:bg-surface-2 hover:text-ink lg:hidden"
      >
        <Menu className="h-4.5 w-4.5" aria-hidden />
      </button>
      <button
        type="button"
        aria-label="Search documentation"
        onClick={openDocsSearch}
        className="rounded-md p-1.5 text-ink-subtle hover:bg-surface-2 hover:text-ink lg:hidden"
      >
        <Search className="h-4.5 w-4.5" aria-hidden />
      </button>

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1 text-[13.5px]">
        {hit ? (
          <p className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-ink-subtle">{hit.category.label}</span>
            <span className="shrink-0 text-ink-tertiary" aria-hidden>
              /
            </span>
            <span className="truncate font-medium text-ink">{hit.page.title}</span>
          </p>
        ) : (
          <p className="truncate font-medium text-ink">Documentation</p>
        )}
      </nav>

      {/* Right controls */}
      <div className="flex shrink-0 items-center gap-1.5">
        <ThemeButton />
        {hit && <CopyPage slug={slug} />}
        <Link
          href="/dashboard"
          className="ml-1 flex h-8 items-center rounded-lg border border-hairline bg-canvas px-3.5 text-[13px] font-medium text-ink shadow-sm transition-colors hover:bg-surface-1"
        >
          Open app
        </Link>
      </div>
    </header>
  );
}

function ThemeButton() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span className="h-8 w-8" aria-hidden />;
  const isDark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="rounded-md p-2 text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink"
    >
      {isDark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
    </button>
  );
}

const MARKDOWN_URL = (slug: string) => `/api/docs/markdown?slug=${encodeURIComponent(slug)}`;

function CopyPage({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const copy = async () => {
    try {
      const res = await fetch(MARKDOWN_URL(slug));
      const md = await res.text();
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      setOpen(false);
    } catch {
      setOpen(false);
    }
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-8 items-center gap-1.5 rounded-lg border border-hairline bg-surface-1 px-2.5 text-[13px] font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-success" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
        <span className="hidden sm:block">{copied ? "Copied" : "Copy page"}</span>
        <ChevronDown className={`h-3 w-3 text-ink-tertiary transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-9 z-30 w-[190px] overflow-hidden rounded-lg border border-hairline bg-popover py-1 shadow-lg">
          <button
            type="button"
            role="menuitem"
            onClick={copy}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-ink-muted transition-colors hover:bg-surface-1 hover:text-ink"
          >
            <Copy className="h-3.5 w-3.5 text-ink-tertiary" aria-hidden />
            Copy page
          </button>
          <a
            role="menuitem"
            href={`/docs/${slug}.md`}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-ink-muted transition-colors hover:bg-surface-1 hover:text-ink"
          >
            <FileGlyph className="h-3.5 w-3.5 text-ink-tertiary" aria-hidden />
            View as Markdown
          </a>
        </div>
      )}
    </div>
  );
}

function FileGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  );
}
