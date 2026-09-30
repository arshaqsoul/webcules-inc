/* Docs page shell (server) — Linear's reading layout: a ~720px prose column
 * with the "on this page" rail on the right. The H1 + intro come from the
 * nav registry; the body from the content module. The TOC is extracted from
 * the content element without rendering it. */
import { findDocPage } from "@/lib/docs/nav";
import { getDocContent } from "@/lib/docs/registry";
import { extractToc } from "@/lib/docs/extract";

import { Tier } from "@/lib/docs/primitives";
import { DocsToc } from "./toc";

const TIER_OF = { lite: "lite", studio: "studio", pro: "pro" } as const;

export function DocShell({ slug }: { slug: string }) {
  const hit = findDocPage(slug);
  const Content = getDocContent(slug);
  if (!hit || !Content) return null;

  const toc = extractToc(<Content />);

  return (
    <div className="mx-auto flex w-full max-w-[1180px] items-start px-6 lg:px-10">
      <article className="docs-prose min-w-0 max-w-[720px] flex-1 pb-24 pt-8 lg:pt-12">
        <h1 className="docs-h1">
          {hit.page.title}
          {hit.page.tier && <Tier plan={TIER_OF[hit.page.tier]} className="ml-3 align-[2px]" />}
        </h1>
        <p className="docs-intro">{hit.page.description}</p>
        <Content />
      </article>
      <DocsToc items={toc} />
    </div>
  );
}
