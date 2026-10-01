/* /learn — video guide home (Linear's learn index): one card per guide,
 * ordered as a getting-started series. Public (no auth). */
import Link from "next/link";

import { LEARN_GUIDES, fmt } from "@/lib/learn/nav";

export const metadata = {
  title: { absolute: "Learn · Snap" },
  description:
    "Video guides for running your photography studio on Snap — watch the whole loop, from a booking to a delivered gallery and a payout.",
};

export default function LearnIndexPage() {
  return (
    <div className="docs-shell mx-auto w-full max-w-[920px] px-6 pb-28 pt-8 lg:px-10 lg:pt-12">
      <p className="text-[13px] font-medium text-ink-tertiary">Snap learn</p>
      <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.6px] text-ink">Learn Snap</h1>
      <p className="mt-3 max-w-[640px] text-[15px] leading-relaxed text-ink-muted">
        Short video guides that walk the real product. Start with Intro to Snap — it follows one
        booking all the way to a delivered gallery and a payout.
      </p>

      <h2 className="mt-12 text-[15px] font-semibold text-ink">Getting started</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {LEARN_GUIDES.map((g) => (
          <Link
            key={g.slug}
            href={`/learn/${g.slug}`}
            className="group rounded-[12px] border border-hairline p-4 transition-colors hover:border-hairline-strong hover:bg-surface-1"
          >
            <span className="flex h-8 items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4" aria-hidden>
                  <path d="M5.5 3.6a1 1 0 0 1 1.53-.85l6 4.4a1 1 0 0 1 0 1.7l-6 4.4a1 1 0 0 1-1.53-.85V3.6Z" />
                </svg>
              </span>
              <span className="text-[12.5px] tabular-nums text-ink-tertiary">{fmt(g.seconds)}</span>
            </span>
            <span className="mt-3 block text-[14px] font-medium text-ink">{g.title}</span>
            <span className="mt-1 line-clamp-2 block text-[13px] leading-relaxed text-ink-subtle">
              {g.description}
            </span>
          </Link>
        ))}
      </div>

      <p className="mt-12 text-[13.5px] text-ink-subtle">
        Prefer reading? The same ground is covered step by step in the{" "}
        <Link href="/docs/start-guide" className="text-primary hover:underline">
          Start Guide
        </Link>
        .
      </p>
    </div>
  );
}
