/* /docs/<slug> — one doc page rendered by the shared shell. Metadata is
 * generated from the nav registry (Linear-style: flat slugs, per-page
 * titles). Public (no auth). */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { findDocPage } from "@/lib/docs/nav";
import { getDocContent } from "@/lib/docs/registry";
import { DocShell } from "@/components/docs/doc-shell";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const hit = findDocPage(slug);
  if (!hit) return {};
  return {
    title: { absolute: `${hit.page.title} · Snap docs` },
    description: hit.page.description,
  };
}

export default async function DocPageRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!findDocPage(slug) || !getDocContent(slug)) notFound();
  return <DocShell slug={slug} />;
}
