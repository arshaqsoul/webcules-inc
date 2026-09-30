/* Snap docs — element-tree extraction (server only).
 *
 * Doc content is a tree of React elements (the primitives + plain JSX).
 * Three consumers walk the same tree without rendering anything:
 *  - extractToc(): H2/H3 list for the right-hand "on this page" rail,
 *  - toMarkdown(): the "Copy page" / "View as Markdown" payload,
 *  - extractSections(): the search index (GET /api/docs/search).
 * Sync function components are invoked so their element trees are visible;
 * async server components and client islands (hooks) stay opaque. */
import type { ReactElement, ReactNode } from "react";

import { DocsCode } from "@/components/docs-code";

import { headingId, headingTextOf } from "./primitives";

/** Primitive recognition by stable marker, not object identity — bundlers
 * may duplicate the primitives module across chunks, which would break
 * `el.type === H2`-style comparisons in the deployed worker. */
function isKind(el: ReactElement, kind: string): boolean {
  return (el.type as { docKind?: string })?.docKind === kind;
}

export type TocItem = { id: string; title: string; level: 2 | 3 };

const REACT_FRAGMENT = Symbol.for("react.fragment");

function isElement(node: ReactNode): node is ReactElement {
  return typeof node === "object" && node !== null && "props" in (node as unknown as Record<string, unknown>);
}

function isFragment(el: ReactElement): boolean {
  return (el.type as unknown) === REACT_FRAGMENT;
}

/** Element props with unknown erased once, at the boundary. */
function propsOf(el: ReactElement): Record<string, unknown> {
  return ((el as { props?: unknown }).props ?? {}) as Record<string, unknown>;
}

function childrenOf(el: ReactElement): ReactNode {
  return propsOf(el).children as ReactNode;
}

/** Depth-first walk yielding every element node (descends arrays/fragments).
 * Function components are INVOKED synchronously to expose their element
 * tree — doc content modules are sync server components, and without this
 * the whole tree below <Content /> stays opaque (empty TOC/search/markdown).
 * Async components (e.g. the embeds live demo) and hookful client islands
 * return a Promise or throw and stay opaque on purpose. */
function* walk(node: ReactNode): Generator<ReactElement> {
  if (Array.isArray(node)) {
    for (const child of node) yield* walk(child);
    return;
  }
  if (!isElement(node)) return;
  yield node;
  if (isFragment(node)) {
    yield* walk(childrenOf(node));
    return;
  }
  if (typeof node.type === "function") {
    try {
      const out = (node.type as (props: unknown) => ReactNode)(propsOf(node));
      if (out && typeof (out as Promise<unknown>).then === "function") return;
      yield* walk(out);
    } catch {
      // Client island (hooks) or throwing component — stays opaque.
    }
    return;
  }
  const { children } = propsOf(node) as { children?: ReactNode };
  if (typeof node.type === "string") yield* walk(children);
}

/* ------------------------------------------------------------------ */
/* TOC                                                                 */
/* ------------------------------------------------------------------ */

export function extractToc(root: ReactNode): TocItem[] {
  const items: TocItem[] = [];
  for (const el of walk(root)) {
    if (isKind(el, "h2")) {
      const title = headingTextOf(childrenOf(el)).trim();
      items.push({ id: (propsOf(el).id as string | undefined) ?? headingId(childrenOf(el)), title, level: 2 });
    } else if (isKind(el, "h3")) {
      const title = headingTextOf(childrenOf(el)).trim();
      items.push({ id: (propsOf(el).id as string | undefined) ?? headingId(childrenOf(el)), title, level: 3 });
    }
  }
  return items;
}

/** Heading-scoped text sections — the search index + markdown body. */
export type DocSection = { id: string; heading: string; level: 2 | 3; text: string };

/* ------------------------------------------------------------------ */
/* Inline serialization (shared by sections + markdown)                */
/* ------------------------------------------------------------------ */

function inline(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(inline).join("");
  if (!isElement(node)) return "";
  if (isKind(node, "tier")) {
    const plan = String(propsOf(node).plan ?? "");
    const label = plan.charAt(0).toUpperCase() + plan.slice(1);
    return `**[${label}]**`;
  }
  if (node.type === "a") {
    const { href, children } = propsOf(node) as { href?: string; children?: ReactNode };
    return `[${inline(children)}](${href ?? ""})`;
  }
  if (node.type === "strong" || node.type === "b") return `**${inline(childrenOf(node))}**`;
  if (node.type === "em" || node.type === "i") return `*${inline(childrenOf(node))}*`;
  if (node.type === "code") return `\`${inline(childrenOf(node))}\``;
  if (node.type === "br") return "\n";
  return inline(childrenOf(node));
}

/* ------------------------------------------------------------------ */
/* Markdown                                                            */
/* ------------------------------------------------------------------ */

export function toMarkdown(page: { title: string; description: string; slug: string }, root: ReactNode): string {
  const out: string[] = [`# ${page.title}`, "", page.description, ""];

  const blocks = flattenBlocks(root);
  for (const b of blocks) out.push(b, "");

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/** Flatten the content tree into markdown blocks. */
function flattenBlocks(root: ReactNode): string[] {
  const blocks: string[] = [];

  const pushList = (el: ReactElement, ordered: boolean) => {
    const children = childrenOf(el);
    const items: ReactNode[] = Array.isArray(children) ? children : [children];
    const lines = items
      .filter((li) => isElement(li) && li.type === "li")
      .map((li, i) => {
        const body = listInline(childrenOf(li as ReactElement));
        return `${ordered ? `${i + 1}.` : "-"} ${body}`;
      });
    if (lines.length) blocks.push(lines.join("\n"));
  };

  for (const el of walk(root)) {
    if (isKind(el, "h2")) {
      blocks.push(`## ${headingTextOf(childrenOf(el)).trim()}`);
    } else if (isKind(el, "h3")) {
      blocks.push(`### ${headingTextOf(childrenOf(el)).trim()}`);
    } else if (isKind(el, "shot")) {
      const { src, alt } = propsOf(el) as { src: string; alt: string };
      blocks.push(`![${alt}](https://snap.webcules.com${src})`);
    } else if (isKind(el, "note")) {
      blocks.push(`> Note: ${inline(childrenOf(el))}`);
    } else if (isKind(el, "callout")) {
      const { title, children } = propsOf(el) as { title?: string; children?: ReactNode };
      blocks.push(`> ${title ? `**${title}** — ` : ""}${inline(children)}`);
    } else if (isKind(el, "steps")) {
      const { items } = propsOf(el) as { items: ReactNode[] };
      const lines = items.map((item, i) => {
        const parts = flattenBlocks(item);
        const first = parts[0] ?? inline(item);
        const rest = parts.slice(1).join("\n\n");
        return `${i + 1}. ${first}${rest ? `\n\n${rest.split("\n").map((l) => `   ${l}`).join("\n")}` : ""}`;
      });
      blocks.push(lines.join("\n\n"));
    } else if (isKind(el, "docs-code")) {
      const { code, label } = propsOf(el) as { code: string; label?: string };
      blocks.push(`${label ? `${label}\n\n` : ""}\`\`\`\n${code}\n\`\`\``);
    } else if (el.type === "p") {
      const text = inline(childrenOf(el)).trim();
      if (text) blocks.push(text);
    } else if (el.type === "ul" || el.type === "ol") {
      pushList(el, el.type === "ol");
    } else if (el.type === "table") {
      const md = tableToMarkdown(el);
      if (md) blocks.push(md);
    } else if (el.type === "hr") {
      blocks.push("---");
    }
  }
  return blocks;
}

/** List-item bodies may contain paragraphs/blocks — inline them softly. */
function listInline(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(listInline).join(" ");
  if (isElement(node) && (node.type === "p" || isFragment(node))) return inline(childrenOf(node)).trim();
  return inline(node);
}

function tableToMarkdown(table: ReactElement): string | null {
  const rows: string[][] = [];
  const visit = (node: ReactNode) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!isElement(node)) return;
    if (node.type === "tr") {
      const cells: string[] = [];
      const visitCell = (cn: ReactNode) => {
        if (Array.isArray(cn)) return cn.forEach(visitCell);
        if (isElement(cn) && (cn.type === "td" || cn.type === "th")) cells.push(inline(childrenOf(cn)).trim());
      };
      visitCell(childrenOf(node));
      rows.push(cells);
      return;
    }
    visit(childrenOf(node));
  };
  visit(childrenOf(table));
  if (!rows.length) return null;
  const width = Math.max(...rows.map((r) => r.length));
  const norm = rows.map((r) => [...r, ...Array(width - r.length).fill("")]);
  const head = norm[0];
  const lines = [
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...norm.slice(1).map((r) => `| ${r.join(" | ")} |`),
  ];
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Search sections                                                     */
/* ------------------------------------------------------------------ */

export function extractSections(root: ReactNode): DocSection[] {
  const sections: DocSection[] = [];
  let current: DocSection = { id: "intro", heading: "", level: 2, text: "" };

  const flush = () => {
    if (current.text.trim()) sections.push(current);
  };
  const startNew = (el: ReactElement, level: 2 | 3) => {
    flush();
    current = {
      id: (propsOf(el).id as string | undefined) ?? headingId(childrenOf(el)),
      heading: headingTextOf(childrenOf(el)).trim(),
      level,
      text: "",
    };
  };

  for (const el of walk(root)) {
    if (isKind(el, "h2")) startNew(el, 2);
    else if (isKind(el, "h3")) startNew(el, 3);
    else if (el.type === "p") current.text += " " + inline(childrenOf(el));
    else if (el.type === "ul" || el.type === "ol") {
      for (const block of flattenBlocks(el)) current.text += " " + block.replace(/\n/g, " ");
    } else if (isKind(el, "note") || isKind(el, "callout")) {
      current.text += " " + inline(childrenOf(el));
    } else if (el.type === "table") {
      const md = tableToMarkdown(el);
      if (md) current.text += " " + md.replace(/\n/g, " ");
    }
  }
  flush();
  return sections;
}
