import { PAPER_CATALOG_URL, SEARCH_INDEX_URL } from "../../lib/public-storage";
import { absoluteSiteUrl } from "../../lib/site-url";

export function GET() {
  const body = `# The Year in AI Papers

> A research atlas of summarized AI papers: concise editorial summaries, original abstracts, citations, official code links, research labs, and editorial topics.

## Coverage

- Publication window: August 2025 through August 2026.
- The atlas prioritizes widely discussed, high-impact papers from this period; it is not an exhaustive index of every AI paper.
- Summaries are generated fresh by GLM Flash from each paper's arXiv abstract; topic assignments are produced by Jev (TypeSafe AI) through a Cloudflare AI Gateway. Corpus and publication metadata derive from the open-source 1kpapers project (MIT).

## Primary pages

- [Research atlas](${absoluteSiteUrl("/")})
- [Topics](${absoluteSiteUrl("/topics")})
- [Research labs](${absoluteSiteUrl("/labs")})
- [Publication timeline](${absoluteSiteUrl("/timeline")})
- [Most trending papers](${absoluteSiteUrl("/most-trending-papers")})
- [Most cited papers](${absoluteSiteUrl("/most-cited-papers")})
- [Most starred papers](${absoluteSiteUrl("/most-starred-papers")})

## Machine-readable resources

- [XML sitemap](${absoluteSiteUrl("/sitemap.xml")})
- [Paper catalog JSON](${PAPER_CATALOG_URL})
- [Search index JSON](${SEARCH_INDEX_URL})

## Paper URLs

Paper pages use readable, stable title slugs, for example \`${absoluteSiteUrl("/papers/kimi-k3-open-frontier-intelligence")}\`. Slugs are capped at 80 characters. Each page includes a human-readable summary, the original abstract and publication metadata, and ScholarlyArticle JSON-LD. Legacy source-ID URLs permanently redirect to the canonical title-slug URL. Prefer the paper's original arXiv or publisher link when verifying scientific claims.
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
