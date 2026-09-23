import type { Metadata } from "next";
import Link from "next/link";

import { LIBRARY } from "@/components/library/manifest.gen";

export const metadata: Metadata = {
  title: "Components — Webcules",
  description:
    "Copy-pastable components built and used by Webcules. Live playgrounds, docs and source — no package to install, just take the code.",
};

export default function ComponentsOverviewPage() {
  const approved = LIBRARY.filter((c) => c.phase === "approved");

  return (
    /* Same width as the landing page sections (lg:max-w-[85rem]). */
    <div className="mx-auto w-full max-w-[85rem] px-4 pb-28 pt-24 sm:px-6 lg:px-8">
      <div className="mb-12 max-w-2xl">
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-white/35">
          Webcules component library
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">Components</h1>
        <p className="mt-4 text-white/60">
          Copy-pastable components built and battle-tested on Webcules sites.
          Pick one to open its playground — tweak every prop live, copy the
          code, and save your config to your dashboard.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {approved.map((c) => (
          <Link
            key={c.name}
            href={`/components/${c.name}`}
            className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-colors hover:border-white/25"
          >
            {c.preview ? (
              <div className="overflow-hidden border-b border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.preview}
                  alt={`${c.title} preview`}
                  className="aspect-[3/2] w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.02]"
                />
              </div>
            ) : null}
            <div className="flex flex-1 flex-col p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium text-white group-hover:text-violet-300">
                  {c.title}
                </h3>
                {c.premium ? (
                  <span className="rounded-full border border-fuchsia-400/30 bg-fuchsia-400/10 px-2 py-0.5 text-[11px] text-fuchsia-300">
                    premium
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-white/55">
                {c.tagline}
              </p>
              <div className="mt-4 flex items-center justify-between">
                <div className="flex flex-wrap gap-1.5">
                  {c.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/50"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <span className="text-xs text-white/40 transition-colors group-hover:text-violet-300">
                  {c.premium ? "Learn more →" : "Open playground →"}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <p className="mt-12 text-sm leading-relaxed text-white/40">
        Every component is plain React + Tailwind — no package to install. Grab
        it with the CLI or copy the source straight from its playground.
      </p>
    </div>
  );
}
