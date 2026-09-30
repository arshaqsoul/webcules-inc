/* GET /api/docs/search?q=… — small server-side search over the doc content.
 * The index (one entry per heading-scoped section) is built lazily from the
 * content registry and cached module-level; scoring is plain token matching
 * with title/heading boost. No DB, no third-party service. */
import { createElement, type ReactElement } from "react";
import { NextResponse } from "next/server";

import { DOC_CATEGORIES } from "@/lib/docs/nav";
import { getDocContent } from "@/lib/docs/registry";
import { extractSections } from "@/lib/docs/extract";

type IndexedSection = {
  slug: string;
  title: string;
  category: string;
  sectionId: string | null;
  heading: string;
  text: string;
};

type Hit = {
  slug: string;
  title: string;
  category: string;
  sectionId: string | null;
  heading: string | null;
  snippet: string;
  score: number;
};

let INDEX: IndexedSection[] | null = null;

function buildIndex(): IndexedSection[] {
  if (INDEX) return INDEX;
  const index: IndexedSection[] = [];
  for (const category of DOC_CATEGORIES) {
    for (const page of category.pages) {
      const Content = getDocContent(page.slug);
      if (!Content) continue;
      const el = createElement(Content) as ReactElement;
      for (const section of extractSections(el)) {
        index.push({
          slug: page.slug,
          title: page.title,
          category: category.label,
          sectionId: section.heading ? section.id : null,
          heading: section.heading,
          text: section.text.replace(/\s+/g, " ").trim(),
        });
      }
    }
  }
  INDEX = index;
  return index;
}

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

function snippetFor(text: string, tokens: string[]): string {
  const lower = text.toLowerCase();
  let at = -1;
  for (const t of tokens) {
    const i = lower.indexOf(t);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return text.slice(0, 90) + (text.length > 90 ? "…" : "");
  const start = Math.max(0, at - 34);
  const end = Math.min(text.length, at + 76);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const tokens = tokenize(q);
  if (tokens.length === 0) return NextResponse.json({ hits: [] });

  const index = buildIndex();
  const hits: Hit[] = [];

  for (const entry of index) {
    const titleLower = entry.title.toLowerCase();
    const headingLower = entry.heading.toLowerCase();
    const textLower = entry.text.toLowerCase();
    // Every token must appear somewhere in this section's page context.
    let all = true;
    let score = 0;
    for (const t of tokens) {
      const inTitle = titleLower.includes(t);
      const inHeading = headingLower.includes(t);
      const inText = textLower.includes(t);
      if (!inTitle && !inHeading && !inText) {
        all = false;
        break;
      }
      score += (inTitle ? 6 : 0) + (inHeading ? 5 : 0) + (inText ? 1 : 0);
    }
    if (!all) continue;
    hits.push({
      slug: entry.slug,
      title: entry.title,
      category: entry.category,
      sectionId: entry.sectionId,
      heading: entry.heading || null,
      snippet: snippetFor(entry.text, tokens),
      score,
    });
  }

  hits.sort((a, b) => b.score - a.score);
  return NextResponse.json({ hits: hits.slice(0, 12).map(({ score: _score, ...hit }) => hit) });
}
