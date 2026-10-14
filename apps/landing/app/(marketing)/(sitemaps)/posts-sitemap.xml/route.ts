import { getServerSideSitemap } from "next-sitemap";
import { getPayload } from "payload";
import config from "@webcules/payload/payload.config";
import { unstable_cache } from "next/cache";

const getPostsSitemap = unstable_cache(
  async () => {
    const payload = await getPayload({ config });
    // Fail closed: no base URL, no sitemap — never fall back to example.com.
    // GET() returns 404 when this resolves to null.
    const SITE_URL =
      process.env.NEXT_PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_SERVER_URL ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL ||
      null;
    if (!SITE_URL) return null;

    const results = await payload.find({
      collection: "posts",
      overrideAccess: false,
      draft: false,
      depth: 0,
      limit: 1000,
      pagination: false,
      where: {
        _status: {
          equals: "published",
        },
      },
      select: {
        slug: true,
        updatedAt: true,
      },
    });

    const dateFallback = new Date().toISOString();

    const sitemap = results.docs
      ? results.docs
          .filter((post) => Boolean(post?.slug))
          .map((post) => ({
            loc: `${SITE_URL}/posts/${post?.slug}`,
            lastmod: post.updatedAt || dateFallback,
          }))
      : [];

    return sitemap;
  },
  ["posts-sitemap"],
  {
    tags: ["posts-sitemap"],
  }
);

export async function GET() {
  const sitemap = await getPostsSitemap();
  if (!sitemap) {
    return new Response("Sitemap unavailable: site base URL is not configured.\n", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return getServerSideSitemap(sitemap);
}
