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

      {approved.filter((c) => c !== featured).length ? (
        <section className="mt-12">
          <h2 className="mb-4 text-lg font-medium">All components</h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {approved
              .filter((c) => c !== featured)
              .map((c) => (
                <Link
                  key={c.name}
                  href={`/components/${c.name}`}
                  className="group block overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-colors hover:border-white/25"
                >
                  {c.preview ? (
                    <div className="overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={c.preview}
                        alt={`${c.title} preview`}
                        className="w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.02]"
                      />
                    </div>
                  ) : null}
                  <div className="p-5">
                    <h3 className="font-medium text-white group-hover:text-violet-300">
                      {c.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-white/55">
                      {c.description}
                    </p>
                  </div>
                </Link>
              ))}
          </div>
        </section>
      ) : null}

      <section className="mt-12">
        <h2 className="mb-4 text-lg font-medium">Use it in your project</h2>
        <p className="mb-4 text-sm leading-relaxed text-white/60">
          Every component is plain React + Tailwind — no package to install.
          Grab it with the CLI (or copy the source from its docs page), drop it
          into your project, and import it like any local component:
        </p>
        <pre className="overflow-x-auto rounded-xl border border-white/10 bg-[#0d0d17] p-4 font-mono text-[13px] text-emerald-100/90">
          <code>{`npx shadcn@latest add "https://webcules.com/r/neural-pathways.json"

import NeuralPathways from "@/components/ui/neural-pathways";

<NeuralPathways className="absolute inset-0" />`}</code>
        </pre>
      </section>
    </div>
  );
}
