import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LIBRARY } from "@/components/library/manifest.gen";

import { CodeBlock } from "@/components/wildcode-docs/code-block";
import { WildcodePlayground } from "@/components/wildcode-docs/wildcode-playground";

const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

/* docs content for spec-driven (generated) standard components */
const GENERATED_DOCS: Record<
  string,
  { usage: string; playground: boolean; sections: { title: string; items: string[] }[] }
> = {
  // populated by forge:approve when specs declare docs sections
};

type Params = { slug: string };

export function generateStaticParams() {
  return LIBRARY.filter(
    (c) => c.phase === "approved" && c.docsMode === "generated" && !c.premium,
  ).map((c) => ({ slug: c.name }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const entry = LIBRARY.find((c) => c.name === slug);
  if (!entry) return {};
  return {
    title: `${entry.title} — Webcules Components`,
    description: entry.tagline,
  };
}

export default async function LibraryComponentPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const entry = LIBRARY.find((c) => c.name === slug);
  if (!entry) notFound();

  /* premium: preview-only. No code, no playground, no CLI. */
  if (entry.premium) {
    return (
      <div>
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <h1 className="text-4xl font-semibold tracking-tight">{entry.title}</h1>
          <span className="rounded-full border border-fuchsia-400/30 bg-fuchsia-400/10 px-2.5 py-0.5 text-xs text-fuchsia-300">
            premium
          </span>
        </div>
        <p className="mb-8 max-w-2xl text-white/60">{entry.tagline}</p>

        {entry.preview ? (
          <div className="mb-10 overflow-hidden rounded-2xl border border-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={entry.preview}
              alt={`${entry.title} preview`}
              className="w-full"
            />
          </div>
        ) : null}

        <p className="mb-8 max-w-2xl text-sm leading-relaxed text-white/55">
          {entry.description}
        </p>

        <div className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/[0.04] p-6">
          <h2 className="mb-2 text-lg font-medium text-fuchsia-200">
            Premium component
          </h2>
          <p className="mb-4 max-w-xl text-sm leading-relaxed text-white/60">
            This component is part of the Webcules premium library. The source
            is not distributable — we design, build and maintain it for you as
            part of an engagement.
          </p>
          <Link
            href="/contact"
            className="inline-block rounded-lg border border-fuchsia-400/40 bg-fuchsia-400/10 px-4 py-2 text-sm text-fuchsia-200 transition-colors hover:bg-fuchsia-400/20"
          >
            Book a demo to get it →
          </Link>
        </div>
      </div>
    );
  }

  /* standard generated docs */
  const docs = GENERATED_DOCS[entry.name];
  const usage = `import { ${entry.title.replace(/\s+/g, "")} } from "@webcules/ui/components/${entry.name}";`;

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <h1 className="text-4xl font-semibold tracking-tight">{entry.title}</h1>
        {entry.tags.map((t) => (
          <span
            key={t}
            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-white/60"
          >
            {t}
          </span>
        ))}
      </div>
      <p className="mb-10 max-w-2xl text-white/60">{entry.tagline}</p>

      {docs?.playground || entry.preview ? (
        <section className="mb-14">
          <h2 className="mb-4 text-lg font-medium">Preview</h2>
          {entry.preview ? (
            <div className="overflow-hidden rounded-2xl border border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={entry.preview} alt={`${entry.title} preview`} className="w-full" />
            </div>
          ) : (
            <p className="text-sm text-white/40">Preview coming soon.</p>
          )}
        </section>
      ) : null}

      <section className="mb-14">
        <h2 className="mb-4 text-lg font-medium">Usage</h2>
        <CodeBlock code={usage} title="tsx" />
      </section>

      {docs
        ? docs.sections.map((s) => (
            <section key={s.title} className="mb-14">
              <h2 className="mb-4 text-lg font-medium">{s.title}</h2>
              <ul className="list-disc space-y-2 pl-5 text-sm text-white/60">
                {s.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </section>
          ))
        : null}

      {SITE_URL ? (
        <section className="mb-14">
          <h2 className="mb-4 text-lg font-medium">CLI</h2>
          <CodeBlock
            code={`npx shadcn@latest add "${SITE_URL}/r/${entry.name}.json"`}
            title="bash"
          />
        </section>
      ) : null}
    </div>
  );
}
