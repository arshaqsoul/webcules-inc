import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { ComponentPlayground } from "@/components/component-docs/component-playground";
import { LIBRARY } from "@/components/library/manifest.gen";
import { getRegistryEntry } from "@/components/library/registry";

import { getAuth, getSavedConfigForUser } from "@/lib/auth.server";

const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

type Params = { slug: string };
type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = LIBRARY.find((c) => c.name === slug);
  if (!entry) return {};
  return {
    title: `${entry.title} — Webcules Components`,
    description: entry.tagline,
  };
}

export default async function LibraryComponentPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const entry = LIBRARY.find((c) => c.name === slug);
  if (!entry) notFound();

  const siblings = LIBRARY.filter((c) => c.phase === "approved" && !c.premium);
  const idx = siblings.findIndex((c) => c.name === entry.name);
  const prev = idx > 0 ? (siblings[idx - 1] ?? null) : null;
  const next = idx < siblings.length - 1 ? (siblings[idx + 1] ?? null) : null;

  /* premium: preview-only. No code, no playground, no CLI. */
  if (entry.premium) {
    return (
      <div className="dark mx-auto w-full max-w-4xl px-6 pb-28 pt-28">
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
            <img src={entry.preview} alt={`${entry.title} preview`} className="w-full" />
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

        <ComponentNav prev={prev} next={next} />
      </div>
    );
  }

  const registry = getRegistryEntry(entry.name);
  if (!registry) notFound();

  /* Deep link from the dashboard: /components/<slug>?c=<savedConfigId> —
   * load that config (owning it) as the workbench starting point. */
  const sp = await searchParams;
  const savedId = typeof sp.c === "string" ? sp.c : null;
  let savedConfig = null;
  if (savedId) {
    try {
      const auth = await getAuth();
      const session = await auth.api.getSession({ headers: await headers() });
      if (session?.user?.id) {
        const sc = await getSavedConfigForUser(savedId, session.user.id);
        if (sc && sc.component === entry.name) savedConfig = sc;
      }
    } catch {
      /* bindings unavailable (e.g. build time) — render without it */
    }
  }

  return (
    /* Same width as the landing page sections (lg:max-w-[85rem]). */
    <div className="dark mx-auto w-full max-w-[85rem] px-4 pb-28 pt-24 sm:px-6 lg:px-8">
      <ComponentPlayground
        entry={{
          name: entry.name,
          title: entry.title,
          tagline: entry.tagline,
          description: entry.description,
          tags: entry.tags,
        }}
        registry={registry}
        siteUrl={SITE_URL}
        savedConfig={savedConfig}
        prev={prev ? { name: prev.name, title: prev.title } : null}
        next={next ? { name: next.name, title: next.title } : null}
      />
    </div>
  );
}

function ComponentNav({
  prev,
  next,
}: {
  prev: { name: string; title: string } | null;
  next: { name: string; title: string } | null;
}) {
  return (
    <nav className="mt-16 grid gap-3 border-t border-white/10 pt-8 sm:grid-cols-2">
      {prev ? (
        <Link
          href={`/components/${prev.name}`}
          className="group rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-white/25"
        >
          <span className="text-xs text-white/40 group-hover:text-white/60">
            ← Previous
          </span>
          <span className="mt-1 block font-medium text-white group-hover:text-violet-300">
            {prev.title}
          </span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          href={`/components/${next.name}`}
          className="group rounded-xl border border-white/10 bg-white/[0.02] p-4 text-right transition-colors hover:border-white/25"
        >
          <span className="text-xs text-white/40 group-hover:text-white/60">
            Next →
          </span>
          <span className="mt-1 block font-medium text-white group-hover:text-violet-300">
            {next.title}
          </span>
        </Link>
      ) : null}
    </nav>
  );
}
