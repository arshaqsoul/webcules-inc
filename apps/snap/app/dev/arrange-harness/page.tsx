/* Dev-only: the shared <PhotoArranger> on synthetic photos, so the drag and
 * drop can be exercised in a real browser without auth, a database or R2.
 * Gated to local dev (NODE_ENV=development) or SNAP_DEV_HARNESS=1.
 *   ?count=60  ?folders=1  ?transformed=1 (host inside a CSS-transformed
 *   parent - the case that used to throw the drag ghost into the corner) */
import { notFound } from "next/navigation";
import { env } from "cloudflare:workers";

import { ArrangeHarness } from "@/components/dev/arrange-harness";

export const dynamic = "force-dynamic";
export const metadata = { title: "Arrange harness", robots: { index: false } };

export default async function ArrangeHarnessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const allowed = process.env.NODE_ENV === "development" || (env.SNAP_DEV_HARNESS as string) === "1";
  if (!allowed) notFound();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const count = Math.min(400, Math.max(2, Number(one("count")) || 48));
  return <ArrangeHarness count={count} withFolders={one("folders") === "1"} transformed={one("transformed") === "1"} />;
}
