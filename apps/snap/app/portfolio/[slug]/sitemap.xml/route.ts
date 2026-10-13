/* Per-site sitemap.xml (WEB-346 AC5): the portfolio home + every visible
 * collection, absolute URLs on the canonical origin (the site's subdomain
 * for Lite+, the app origin for Free's path URL). */
import { headers } from "next/headers";

import { resolvePublicPortfolioPage } from "@/lib/portfolio-page";
import { portfolioSitemap } from "@/lib/portfolio-seo";
import { requestHost } from "@/lib/domains";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await resolvePublicPortfolioPage(slug, requestHost(await headers()) ?? "");
  if (!page) return new Response("Not found", { status: 404 });
  return new Response(portfolioSitemap(page.ctx, page.portfolio), {
    status: 200,
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
