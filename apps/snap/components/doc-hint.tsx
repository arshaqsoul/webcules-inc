"use client";

/* DocHint (WEB-docs) — the in-platform bridge to the documentation: a small
 * pill link pinned next to the surface it explains, opening the exact doc
 * page in a new tab. The idea: users self-serve instead of calling support.
 *
 * Usage: <DocHint slug="domains" /> or with explicit copy
 * <DocHint slug="embeds" label="Embed guide" />. Slugs are typechecked
 * against the docs nav — a page that doesn't exist can't be linked. */
import { BookOpen } from "lucide-react";

import { DOC_CATEGORIES, type DocSlug } from "@/lib/docs/nav";

type HintSlug = DocSlug;

const TITLES: Record<string, string> = Object.fromEntries(
  DOC_CATEGORIES.flatMap((c) => c.pages.map((p) => [p.slug, p.title])),
);

export function DocHint({ slug, label, className = "" }: { slug: HintSlug; label?: string; className?: string }) {
  const title = TITLES[slug] ?? "Docs";
  return (
    <a
      href={`/docs/${slug}`}
      target="_blank"
      rel="noreferrer"
      title={`${title} — opens the docs`}
      aria-label={`${title} — opens the docs in a new tab`}
      className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-hairline bg-surface-1 px-2 text-[11px] font-medium leading-none text-ink-subtle transition-colors hover:border-hairline-strong hover:bg-surface-2 hover:text-ink ${className}`}
    >
      <BookOpen className="h-3 w-3" aria-hidden />
      {label ?? "Guide"}
    </a>
  );
}
