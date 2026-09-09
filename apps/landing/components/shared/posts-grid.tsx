import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Righteous } from "next/font/google";

import type { Post } from "@webcules/payload/payload-types";
import { getServerSideURL } from "@webcules/payload/utilities/getURL";

const righteous = Righteous({ weight: ["400"], subsets: ["latin"] });

type PostsGridProps = {
  posts: Post[];
  currentPage?: number;
  totalPages?: number;
};

// Media URLs are stored relative and served by the CMS worker - make them
  // absolute so they resolve on any app.
const absoluteMediaUrl = (url?: string | null) =>
  url && url.startsWith("/") ? `${getServerSideURL()}${url}` : (url ?? "");

const formatDate = (date?: string | null) => {
  if (!date) return null;
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export function PostsGrid({ posts, currentPage, totalPages }: PostsGridProps) {
  return (
    <div className="mx-auto w-full max-w-6xl px-6">
      {posts.length === 0 ? (
        <p className="py-24 text-center text-slate-400">
          No posts yet — check back soon.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => {
            const imageDoc =
              post.meta?.image && typeof post.meta.image === "object"
                ? post.meta.image
                : typeof post.heroImage === "object"
                  ? post.heroImage
                  : null;
            const image = imageDoc
              ? { ...imageDoc, url: absoluteMediaUrl(imageDoc.url) }
              : null;
            const href = `/posts/${post.slug ?? ""}`;
            const date = formatDate(post.publishedAt);
            const categories = Array.isArray(post.categories)
              ? post.categories.filter(
                  (c): c is Exclude<typeof c, number> => typeof c === "object",
                )
              : [];

            return (
              <Link
                key={post.id}
                href={href}
                className="group flex flex-col overflow-hidden rounded-3xl border-[0.5px] border-gray-700 bg-black/40 transition-all duration-300 hover:-translate-y-1 hover:border-indigo-500/60 hover:shadow-[0_0_40px_rgba(99,102,241,0.15)]"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden">
                  {image?.url ? (
                    <Image
                      src={image.url}
                      alt={image.alt || post.title}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-950 via-darkest to-indigo-900">
                      <span
                        className={`text-5xl text-indigo-500/40 ${righteous.className}`}
                      >
                        W
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-y-3 p-6">
                  {categories.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {categories.slice(0, 2).map((category) => (
                        <span
                          key={category.id}
                          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-slate-300"
                        >
                          {category.title}
                        </span>
                      ))}
                    </div>
                  )}
                  <h2
                    className={`text-xl leading-snug text-white transition-colors group-hover:text-indigo-300 ${righteous.className}`}
                  >
                    {post.title}
                  </h2>
                  {post.meta?.description && (
                    <p className="line-clamp-3 text-sm leading-relaxed text-slate-400">
                      {post.meta.description}
                    </p>
                  )}
                  <div className="mt-auto flex items-center justify-between pt-4 text-xs text-slate-500">
                    <span>{date}</span>
                    <span className="flex items-center gap-x-1 text-indigo-300 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                      Read
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {totalPages && currentPage && totalPages > 1 && (
        <div className="mt-16 flex items-center justify-center gap-x-2">
          {Array.from({ length: totalPages }).map((_, i) => {
            const page = i + 1;
            const isActive = page === currentPage;
            return (
              <Link
                key={page}
                href={page === 1 ? "/posts" : `/posts/page/${page}`}
                aria-current={isActive ? "page" : undefined}
                className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm transition-colors ${
                  isActive
                    ? "border-indigo-500 bg-indigo-500 text-white"
                    : "border-white/10 bg-white/5 text-slate-300 hover:border-indigo-500/50 hover:text-white"
                }`}
              >
                {page}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
