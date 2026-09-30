/* /docs — the documentation home (Linear's docs index): intro + search,
 * a Popular row, and the full category/page map. Public (no auth). */
import Link from "next/link";

import { DOC_CATEGORIES } from "@/lib/docs/nav";
import { DocIcon } from "@/components/docs/icons";
import { SearchTrigger } from "@/components/docs/search";

export const metadata = {
  title: { absolute: "Documentation · Snap" },
  description:
    "Guides for running your photography studio on Snap — leads, bookings, projects, galleries, contracts, and payments.",
};

const POPULAR = ["start-guide", "gallery-delivery", "embeds", "billing-plans"];

export default function DocsIndexPage() {
  const all = DOC_CATEGORIES.flatMap((c) => c.pages.map((p) => ({ c, p })));

  return (
    <div className="docs-shell mx-auto w-full max-w-[920px] px-6 pb-28 pt-8 lg:px-10 lg:pt-12">
      <p className="text-[13px] font-medium text-ink-tertiary">Snap docs</p>
      <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.6px] text-ink">Snap documentation</h1>
      <p className="mt-3 max-w-[640px] text-[15px] leading-relaxed text-ink-muted">
        Run the whole studio — inquiries, bookings, projects, galleries, and payment — in one place.
        Start with the Start Guide, or search for the thing you&apos;re trying to do.
      </p>
      <div className="mt-6">
        <SearchTrigger />
      </div>

      <h2 className="mt-12 text-[15px] font-semibold text-ink">Popular</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {POPULAR.map((slug) => {
          const hit = all.find(({ p }) => p.slug === slug);
          if (!hit) return null;
          return (
            <Link
              key={slug}
              href={`/docs/${slug}`}
              className="group rounded-[12px] border border-hairline p-4 transition-colors hover:border-hairline-strong hover:bg-surface-1"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-1 text-ink-subtle transition-colors group-hover:bg-surface-2">
                <DocIcon icon={hit.p.icon} />
              </span>
              <span className="mt-3 block text-[14px] font-medium text-ink">{hit.p.title}</span>
              <span className="mt-1 line-clamp-2 block text-[13px] leading-relaxed text-ink-subtle">
                {hit.p.description}
              </span>
            </Link>
          );
        })}
      </div>

      <h2 className="mt-12 text-[15px] font-semibold text-ink">Browse everything</h2>
      <div className="mt-5 grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
        {DOC_CATEGORIES.map((category) => (
          <div key={category.id}>
            <p className="text-[13px] font-semibold text-ink">{category.label}</p>
            <ul className="mt-2 flex flex-col">
              {category.pages.map((page) => (
                <li key={page.slug}>
                  <Link
                    href={`/docs/${page.slug}`}
                    className="flex items-center gap-2.5 rounded-md py-[5px] text-[13.5px] text-ink-subtle transition-colors hover:text-ink"
                  >
                    <DocIcon icon={page.icon} className="h-[15px] w-[15px] shrink-0 text-ink-tertiary" />
                    <span className="min-w-0 flex-1 truncate">{page.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
