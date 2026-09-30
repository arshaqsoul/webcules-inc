/* Snap docs — content primitives (server components).
 *
 * Every doc page composes these instead of raw HTML so that:
 *  - headings carry ids and are discoverable for the right-hand TOC
 *    (lib/docs/extract.tsx walks the element tree — no context, no parser),
 *  - "Copy page" can serialize the same tree to Markdown,
 *  - screenshots always sit on a brand gradient card, Linear-style,
 *  - plan gating is labeled honestly with one consistent badge.
 *
 * Keep them sync and server-safe; client islands (DocsCode, live demos) are
 * imported into content as opaque children — extraction skips them. */
import type { ReactElement, ReactNode } from "react";

import { DOC_CATEGORIES, type DocTier } from "./nav";

/* ------------------------------------------------------------------ */
/* Headings                                                            */
/* ------------------------------------------------------------------ */

export function H2({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id ?? headingId(children)} className="docs-h2 scroll-mt-24" data-doc-h2="">
      {children}
    </h2>
  );
}

export function H3({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h3 id={id ?? headingId(children)} className="docs-h3 scroll-mt-24" data-doc-h3="">
      {children}
    </h3>
  );
}

/* Extraction markers — lib/docs/extract.tsx recognizes primitives by these
 * instead of object identity: bundlers may duplicate this module (relative
 * vs alias imports land in different bundle chunks), which would make
 * `el.type === H2` false across the duplicate. */
type DocKinded = { docKind?: string };
(H2 as DocKinded).docKind = "h2";
(H3 as DocKinded).docKind = "h3";
(Note as DocKinded).docKind = "note";
(Callout as DocKinded).docKind = "callout";
(Shot as DocKinded).docKind = "shot";
(Steps as DocKinded).docKind = "steps";
(Tier as DocKinded).docKind = "tier";

/* ------------------------------------------------------------------ */
/* Plan badge                                                          */
/* ------------------------------------------------------------------ */

const TIER_LABEL: Record<DocTier, string> = { lite: "Lite", studio: "Studio", pro: "Pro" };

/** Minimum-plan badge — "reading is free, the feature is not." */
export function Tier({ plan, className = "" }: { plan: DocTier; className?: string }) {
  return (
    <span
      className={`docs-tier inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold leading-4 text-primary ${className}`}
      data-doc-tier={plan}
    >
      {TIER_LABEL[plan]}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Callouts                                                            */
/* ------------------------------------------------------------------ */

/** Linear-style italic margin note. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="docs-note" data-doc-note="">
      <em>Note:</em> {children}
    </p>
  );
}

/** Bordered callout for "before you do this" warnings and tips. */
export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn";
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={`docs-callout docs-callout-${tone}`} data-doc-callout={tone}>
      {title && <p className="font-semibold text-ink">{title}</p>}
      <div className="docs-callout-body">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Screenshot on a gradient card                                       */
/* ------------------------------------------------------------------ */

export const SHOT_GRADIENTS = {
  dusk: "linear-gradient(135deg, #43489f 0%, #6e71d6 52%, #b3a7ef 100%)",
  sea: "linear-gradient(135deg, #1d3f8f 0%, #2f7fd0 55%, #7fc8e8 100%)",
  moss: "linear-gradient(135deg, #0d5c40 0%, #1a9a67 55%, #74d3a8 100%)",
  ember: "linear-gradient(135deg, #9a3d12 0%, #d96b2b 55%, #f0b27a 100%)",
  plum: "linear-gradient(135deg, #6d1f7e 0%, #a943b8 55%, #dca3e8 100%)",
  night: "linear-gradient(135deg, #10141f 0%, #1d2436 55%, #3c4a66 100%)",
} as const;

export type ShotGradient = keyof typeof SHOT_GRADIENTS;

/** App screenshot inset on a gradient panel — the docs hero pattern. */
export function Shot({
  src,
  alt,
  grad = "dusk",
  wide = false,
}: {
  src: string;
  alt: string;
  grad?: ShotGradient;
  /** Wide shots (kanban boards, calendars) bleed edge-to-edge of the column. */
  wide?: boolean;
}) {
  return (
    <figure className={`docs-shot ${wide ? "docs-shot-wide" : ""}`} data-doc-shot="">
      <div className="docs-shot-panel" style={{ background: SHOT_GRADIENTS[grad] }}>
        {/* alt is descriptive; the src is a trusted first-party asset */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} loading="lazy" className="docs-shot-img" />
      </div>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

/** Numbered walkthrough — lavender markers, generous spacing. */
export function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="docs-steps" data-doc-steps="">
      {items.map((item, i) => (
        <li key={i}>
          <span className="docs-step-n" aria-hidden>
            {i + 1}
          </span>
          <div className="docs-step-body">{item}</div>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Cross-links                                                         */
/* ------------------------------------------------------------------ */

/** "Related page" pill row — links to sibling docs by slug (typechecked). */
export function Related({ slugs }: { slugs: readonly string[] }) {
  const all = DOC_CATEGORIES.flatMap((c) => c.pages.map((p) => ({ c, p })));
  return (
    <nav aria-label="Related docs" className="docs-related" data-doc-related="">
      {slugs.map((slug) => {
        const hit = all.find(({ p }) => p.slug === slug);
        if (!hit) return null;
        return (
          <a key={slug} href={`/docs/${slug}`} className="docs-related-pill">
            {hit.p.title}
          </a>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Heading id derivation                                               */
/* ------------------------------------------------------------------ */

export function headingTextOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(headingTextOf).join("");
  const el = node as ReactElement<{ children?: ReactNode }>;
  // Plan badges inside headings ("Watermarks <Tier studio/>") read as
  // "Watermarks" in the TOC — the badge renders, the text skips it.
  if ((el.type as { docKind?: string })?.docKind === "tier") return "";
  if (el.props && typeof el.props === "object" && "children" in el.props) {
    return headingTextOf(el.props.children);
  }
  return "";
}

/** kebab-case id from heading text — stable as long as the copy is. */
export function headingId(children: ReactNode): string {
  return (
    headingTextOf(children)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "section"
  );
}
