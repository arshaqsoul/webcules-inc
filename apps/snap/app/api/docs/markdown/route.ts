/* GET /api/docs/markdown?slug=… — the "Copy page" / "View as Markdown"
 * payload: the doc's element tree serialized to clean Markdown, images as
 * absolute URLs so the copy survives outside the site. */
import { createElement, type ReactElement } from "react";

import { findDocPage } from "@/lib/docs/nav";
import { getDocContent } from "@/lib/docs/registry";
import { toMarkdown } from "@/lib/docs/extract";

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  const hit = findDocPage(slug);
  const Content = hit ? getDocContent(slug) : null;
  if (!hit || !Content) return new Response("Not found", { status: 404 });

  const el = createElement(Content) as ReactElement;
  const md = toMarkdown({ title: hit.page.title, description: hit.page.description, slug }, el);
  return new Response(md, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
