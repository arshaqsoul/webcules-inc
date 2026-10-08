/* /p/{token} (WEB-262) — the public shared-photo card. A bride sends one
 * photo to the family WhatsApp: they get a rich og card + this page —
 * full-bleed photo (watermarked when the gallery watermarks), the studio's
 * name, and a "book your session" CTA into the studio's booking page.
 * Every resolution walks the parent grant: revoking/expiring/regenerating
 * the gallery or flipping sharing off kills the card. Views count against
 * the gallery's budgets exactly like the gallery itself. */
import type { Metadata } from "next";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { deterrentsOn, isWhiteLabeled } from "@/lib/branding";
import { SnapBadge } from "@/components/snap-badge";
import { effectiveWatermark } from "@/lib/watermark";
import { getStudioProfile, getStudioSlug } from "@/lib/repos/studios";
import { getPlanEntitlements } from "@/lib/plans";
import { resolvePhotoShare } from "@/lib/shares/photo-shares";
import { photoShareImageLink } from "@/lib/photo-link";
import { clientUrl } from "@/lib/client-urls";
import { checkImageView, countGalleryOpen } from "@/lib/limits";
import { clientIp, logShareAccess } from "@/lib/shares/gallery-auth";
import { safeHexColor } from "@/lib/embed";
import { PUBLIC_HOST } from "@/lib/hosts";

export const dynamic = "force-dynamic";

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return { robots: { index: false } };
  const resolved = await resolvePhotoShare(token);
  if (!resolved) return { robots: { index: false } };
  const [profile, project] = await Promise.all([
    getStudioProfile(resolved.grant.organizationId),
    getDb()
      .select({ title: schema.projects.title })
      .from(schema.projects)
      .where(eq(schema.projects.id, resolved.grant.projectId))
      .limit(1),
  ]);
  const studioName = profile?.studioName ?? "the studio";
  const title = `${project[0]?.title ?? "Photos"} · ${studioName}`;
  const image = await clientUrl(resolved.grant.organizationId, await photoShareImageLink(resolved.asset.id, resolved.share.id));
  return {
    title,
    openGraph: { title, images: [image] },
    twitter: { card: "summary_large_image", images: [image] },
    robots: { index: false },
  };
}

export default async function SharedPhotoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = TOKEN_RE.test(token) ? await resolvePhotoShare(token) : null;
  if (!resolved) {
    // Neutral — never confirms whether a link ever existed.
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#101014] p-6 text-center">
        <p className="text-sm text-white/60">This link is no longer available.</p>
      </main>
    );
  }

  const { share, grant, asset } = resolved;
  const [profile, ent, project] = await Promise.all([
    getStudioProfile(grant.organizationId),
    getPlanEntitlements(grant.organizationId),
    getDb()
      .select({ title: schema.projects.title, watermarkOverride: schema.projects.watermarkOverride })
      .from(schema.projects)
      .where(eq(schema.projects.id, grant.projectId))
      .limit(1),
  ]);
  const studioName = profile?.studioName ?? "the studio";
  const brand = JSON.parse(profile?.brand || "{}") as { accent?: string };
  const accent = safeHexColor(brand.accent) ?? "#5e6ad2";
  const whiteLabel = isWhiteLabeled(ent, profile?.brand);

  // Budgets: per-IP window + the gallery's monthly count — a viral shared
  // photo can't drain a gallery past its own pause state.
  const ip = clientIp(new Request("https://x/", { headers: await headers() }));
  if (ip) {
    const limit = await checkImageView(ip, grant.organizationId, grant.id);
    if (!limit.ok) return <PausedCard studioName={studioName} accent={accent} />;
  }
  await logShareAccess(grant.id, "share_view", new Request("https://x/", { headers: await headers() }));
  if (!(await countGalleryOpen(grant.organizationId, grant.id))) {
    return <PausedCard studioName={studioName} accent={accent} />;
  }

  const watermarked =
    effectiveWatermark({ ent, brand: profile?.brand, override: project[0]?.watermarkOverride ?? null, studioName }) !== null;
  const slug = await getStudioSlug(grant.organizationId);
  const imageUrl = await photoShareImageLink(asset.id, share.id);
  const bookingUrl = slug ? await clientUrl(grant.organizationId, `/b/${slug}`) : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-between bg-[#101014]" style={{ ["--accent" as string]: accent }}>
      <header className="w-full px-5 py-4">
        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/70">{studioName}</span>
      </header>

      <div className="flex w-full max-w-4xl flex-1 items-center justify-center px-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed public proxy, no optimizer */}
        <img
          src={imageUrl}
          alt={project[0]?.title ?? "Shared photo"}
          className="max-h-[70vh] w-full rounded-[12px] object-contain"
          draggable={false}
        />
      </div>

      <footer className="flex w-full max-w-4xl flex-col items-center gap-2 px-5 py-6 text-center">
        {project[0]?.title ? <p className="text-sm text-white/70">{project[0].title}</p> : null}
        {bookingUrl ? (
          <a
            href={bookingUrl}
            className="mt-1 rounded-full px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition-[filter] hover:brightness-110"
            style={{ background: accent }}
          >
            Photographed by {studioName} — book your session
          </a>
        ) : (
          <p className="text-sm text-white/70">Photographed by {studioName}</p>
        )}
          {!whiteLabel ? <p className="mt-1 text-[11px] text-white/40"><SnapBadge medium="portal">Delivered by Snap · {PUBLIC_HOST}</SnapBadge></p> : null}
      </footer>
    </main>
  );
}

function PausedCard({ studioName, accent }: { studioName: string; accent: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#101014] p-6">
      <div className="w-full max-w-md rounded-[16px] border border-white/10 bg-white/5 p-8 text-center">
        <span className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: accent }}>
          {studioName}
        </span>
        <h1 className="mt-3 text-lg font-semibold text-white">This photo is taking a short break</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/60">It has been viewed an extraordinary number of times — check back soon.</p>
      </div>
    </main>
  );
}
