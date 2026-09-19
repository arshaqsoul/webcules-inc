import type { Metadata } from "next";
import Link from "next/link";

import { LIBRARY } from "@/components/library/manifest.gen";

export const metadata: Metadata = {
  title: "Components — Webcules",
  description:
    "Copy-pastable components built and used by Webcules. Live previews, docs and source.",
};

export default function ComponentsOverviewPage() {
  const approved = LIBRARY.filter((c) => c.phase === "approved");
  const featured = approved.find((c) => c.preview && !c.premium);

  return (
    <div>
      <h1 className="text-4xl font-semibold tracking-tight">Components</h1>
      <p className="mt-4 max-w-2xl text-white/60">
        Copy-pastable components built and battle-tested on Webcules sites.
        Pick a component from the sidebar — every entry ships with a live
        playground, docs and full source. No package to install, just take the
        code.
      </p>

      {featured ? (
        <section className="mt-12">
          <h2 className="mb-4 text-lg font-medium">Featured</h2>
          <Link
            href={`/components/${featured.name}`}
            className="group block overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-colors hover:border-white/25"
          >
            {featured.preview ? (
              <div className="overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={featured.preview}
                  alt={`${featured.title} preview`}
                  className="w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.02]"
                />
              </div>
            ) : null}
            <div className="p-5">
              <h3 className="font-medium text-white group-hover:text-violet-300">
                {featured.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-white/55">
                {featured.description}
              </p>
            </div>
          </Link>
        </section>
      ) : null}

      <section className="mt-12">
        <h2 className="mb-4 text-lg font-medium">Use it anywhere</h2>
        <p className="mb-4 text-sm leading-relaxed text-white/60">
          The components live in <code className="font-mono text-white/80">@webcules/ui</code> —
          available in every Webcules app. Any page (including this one) can
          render them directly:
        </p>
        <pre className="overflow-x-auto rounded-xl border border-white/10 bg-[#0d0d17] p-4 font-mono text-[13px] text-emerald-100/90">
          <code>{`import { WildcodeField } from "@webcules/ui/components/wildcode-field";

<WildcodeField phrase="Start today" className="my-8" />`}</code>
        </pre>
      </section>
    </div>
  );
}
