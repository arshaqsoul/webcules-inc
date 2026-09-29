/* /my (WEB-263) — the client home: one email, every gallery + sneak peek.
 * Passwordless (email OTP → 30-day remembered device), installable as the
 * studio's app (manifest + service worker). Lite+ per WEB-267: only paid
 * orgs' content is listed (a free studio's clients simply aren't surfaced
 * here — the studio's own gallery links keep working as always). */
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { env } from "cloudflare:workers";

import { MyGate } from "@/components/my-gate";
import { MyInstallBanner, PwaRuntime } from "@/components/my-pwa";
import { resolveMySession } from "@/lib/shares/my-auth";
import { listMyGalleries, listMyPeeks } from "@/lib/repos/my-home";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your photos",
  robots: { index: false },
  manifest: "/my/manifest.webmanifest",
};

function fmtExpiry(epoch: number | null): string | null {
  if (!epoch) return null;
  const days = Math.ceil((epoch * 1000 - Date.now()) / 86400_000);
  if (days <= 0) return "closing soon";
  if (days === 1) return "closes tomorrow";
  return `closes in ${days} days`;
}

export default async function MyHomePage() {
  const email = await resolveMySession(await headers());

  if (!email) {
    return <MyGate studioHint="Snap" turnstileSiteKey={env.TURNSTILE_SITE_KEY ?? ""} />;
  }

  const [galleries, peeks] = await Promise.all([listMyGalleries(email), listMyPeeks(email)]);
  const studioName = galleries[0]?.studioName ?? peeks[0]?.studioName ?? "your photographer";

  return (
    <main className="min-h-screen bg-canvas">
      <PwaRuntime enabled />
      <header className="border-b border-hairline">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">{studioName}</span>
            <h1 className="text-lg font-semibold text-ink">Your photos</h1>
          </div>
          <span className="max-w-40 truncate text-xs text-ink-tertiary">{email}</span>
        </div>
      </header>

      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-6">
        <MyInstallBanner studioName={studioName} />

        {peeks.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-tertiary">A first look</h2>
            {peeks.map((peek) => (
              <div key={peek.projectId} className="rounded-[12px] border border-hairline bg-surface-1 p-4">
                <p className="text-sm font-medium text-ink">
                  {peek.projectTitle} <span className="font-normal text-ink-tertiary">· {peek.studioName}</span>
                </p>
                <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
                  {peek.assetIds.map((id) => (
                    // eslint-disable-next-line @next/next/no-img-element -- session-cookie proxy
                    <img
                      key={id}
                      src={`/api/myimg/${id}?p=${peek.projectId}`}
                      alt="Sneak peek"
                      className="h-28 w-28 shrink-0 rounded-[8px] border border-hairline object-cover"
                      loading="lazy"
                    />
                  ))}
                </div>
                <p className="mt-2 text-xs text-ink-tertiary">Your full gallery lands here soon.</p>
              </div>
            ))}
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-tertiary">Galleries</h2>
          {galleries.length === 0 ? (
            <p className="rounded-[12px] border border-hairline bg-surface-1 p-5 text-sm text-ink-subtle">
              No open galleries right now — new ones appear here the moment {studioName} shares them.
            </p>
          ) : (
            galleries.map((g) => (
              <Link
                key={g.grantId}
                href={`/api/my/open/${g.grantId}`}
                className="group flex items-center gap-4 rounded-[12px] border border-hairline bg-surface-1 p-4 transition-colors hover:border-primary/50"
              >
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[8px] border border-hairline bg-surface-2">
                  {g.coverAssetId ? (
                    // eslint-disable-next-line @next/next/no-img-element -- session-cookie proxy
                    <img src={`/api/myimg/${g.coverAssetId}?g=${g.grantId}`} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{g.projectTitle}</p>
                  <p className="text-xs text-ink-tertiary">{g.studioName}</p>
                  <p className="mt-1 text-xs text-ink-subtle">
                    {g.assetCount} photo{g.assetCount === 1 ? "" : "s"}
                    {g.favoritesCount > 0 ? ` · ${g.favoritesCount} favorited` : ""}
                    {g.expiresAt ? ` · ${fmtExpiry(g.expiresAt)}` : ""}
                  </p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-tertiary transition-transform group-hover:translate-x-0.5" aria-hidden>
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </Link>
            ))
          )}
        </section>

        <p className="text-center text-xs text-ink-tertiary">Delivered by Snap · snap.webcules.com</p>
      </div>
    </main>
  );
}
