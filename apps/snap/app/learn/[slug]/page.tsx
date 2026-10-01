/* /learn/<slug> — one video guide: player with a chapter rail (click a
 * timestamp to jump), transcript, and links into the docs. Public (no auth). */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { findLearnGuide, fmt, LEARN_GUIDES } from "@/lib/learn/nav";
import { LearnVideo } from "@/components/learn/learn-video";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const guide = findLearnGuide(slug);
  if (!guide) return {};
  return {
    title: { absolute: `${guide.title} · Snap learn` },
    description: guide.description,
  };
}

export default async function LearnGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = findLearnGuide(slug);
  if (!guide) notFound();
  const idx = LEARN_GUIDES.findIndex((g) => g.slug === slug);
  const next = LEARN_GUIDES[idx + 1];

  return (
    <div className="docs-shell mx-auto w-full max-w-[920px] px-6 pb-28 pt-8 lg:px-10 lg:pt-12">
      <p className="text-[13px] font-medium text-ink-tertiary">Snap learn · Getting started</p>
      <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.6px] text-ink">{guide.title}</h1>
      <p className="mt-3 max-w-[640px] text-[15px] leading-relaxed text-ink-muted">{guide.description}</p>
      <p className="mt-2 text-[13px] tabular-nums text-ink-tertiary">{fmt(guide.seconds)}</p>

      <div className="mt-6">
        <Suspense fallback={null}>
          <LearnVideo
            src={guide.video}
            poster={guide.poster}
            captions={guide.captions}
            chapters={guide.chapters}
            transcript={guide.transcript}
          />
        </Suspense>
      </div>

      {guide.relatedDocs.length > 0 && (
        <section className="mt-12" aria-label="Related docs">
          <h2 className="text-[15px] font-semibold text-ink">Go deeper in the docs</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {guide.relatedDocs.map((d) => (
              <li key={d}>
                <Link
                  href={`/docs/${d}`}
                  className="inline-block rounded-full border border-hairline px-3.5 py-1.5 text-[13px] text-ink-subtle transition-colors hover:border-hairline-strong hover:text-ink"
                >
                  /docs/{d}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {next && (
        <Link
          href={`/learn/${next.slug}`}
          className="mt-12 flex items-center justify-between rounded-[12px] border border-hairline p-4 transition-colors hover:border-hairline-strong hover:bg-surface-1"
        >
          <span>
            <span className="block text-[12.5px] text-ink-tertiary">Next guide</span>
            <span className="mt-0.5 block text-[14px] font-medium text-ink">{next.title}</span>
          </span>
          <span aria-hidden className="text-ink-tertiary">
            →
          </span>
        </Link>
      )}
    </div>
  );
}
