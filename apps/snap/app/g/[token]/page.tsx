/* Public client gallery at /g/{token} (WEB-125). The grant's status and
 * expiry are re-validated on EVERY render — revocation or expiry kills the
 * page mid-session. No better-auth session is involved: access is either the
 * OTP-verified snap-g cookie (WEB-132) or, under the email-shock contingency
 * (GALLERY_OTP_MODE=off), link possession alone. */
import { headers } from "next/headers";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";

import { GalleryDenied, GalleryGate, GalleryView } from "@/components/gallery-view";
import { deterrentsOn, isWhiteLabeled } from "@/lib/branding";
import { effectiveWatermark } from "@/lib/watermark";
import { brandIcons, brandOgImage, parseBrandAssets } from "@/lib/brand-assets";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getStudioProfile } from "@/lib/repos/studios";
import { getPlanEntitlements } from "@/lib/plans";
import { logShareAccess, resolveGalleryAccess } from "@/lib/shares/gallery-auth";
import { getGrantAssets, getGrantByTokenHashAny, resolveGrantByToken } from "@/lib/shares/grants";
import { getFavorites, getLatestSelection } from "@/lib/shares/selections";
import { safeHexColor } from "@/lib/embed";
import { countGalleryOpen } from "@/lib/limits";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your gallery", robots: { index: false } };

/** WEB-238/239: white-labeled galleries title the tab `{project} · {studio}`
 * (absolute — skips the root layout's `· Snap` template suffix); generated
 * brand assets add the studio favicon + og:image (studio OG card). */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return {};
  const grant = await resolveGrantByToken(token);
  if (!grant) return {};
  const profile = await getStudioProfile(grant.organizationId);
  if (!profile) return {};
  const ent = await getPlanEntitlements(grant.organizationId);
  const bag = parseBrandAssets(profile.brandAssets);
  const icons = brandIcons(bag, grant.organizationId);
  const og = brandOgImage(bag, grant.organizationId);
  const title = `${(await galleryTitle(grant.projectId)) ?? "Your gallery"} · ${profile.studioName}`;
  return {
    ...(isWhiteLabeled(ent, profile.brand) ? { title: { absolute: title } } : {}),
    ...(icons ? { icons } : {}),
    ...(og ? { openGraph: { title, images: [og] } } : {}),
    robots: { index: false },
  };
}

async function galleryTitle(projectId: string): Promise<string | null> {
  return (
    await getDb()
      .select({ title: schema.projects.title })
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .limit(1)
  )[0]?.title ?? null;
}

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

type DeniedProps = { studioName?: string; contactEmail?: string | null; reason: "dead" | "unknown" };

export default async function GalleryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) {
    return <GalleryDenied reason="unknown" />;
  }

  const grant = await resolveGrantByToken(token);

  // Dead-but-known link → branded denial; unknown token → neutral denial.
  if (!grant) {
    const dead = await getGrantByTokenHashAny(token);
    if (dead) {
      const profile = await getStudioProfile(dead.organizationId);
      return (
        <GalleryDenied
          reason="dead"
          studioName={profile?.studioName}
          contactEmail={profile?.contactEmail ?? null}
          whiteLabel={isWhiteLabeled(await getPlanEntitlements(dead.organizationId), profile?.brand)}
        />
      );
    }
    return <GalleryDenied reason="unknown" />;
  }

  const [profile, assets, ent, favorites, selection, projectOverride] = await Promise.all([
    getStudioProfile(grant.organizationId),
    getGrantAssets(grant),
    getPlanEntitlements(grant.organizationId),
    getFavorites(grant.id),
    getLatestSelection(grant.id),
    // WEB-242: per-project watermark override.
    getDb()
      .select({ watermarkOverride: schema.projects.watermarkOverride })
      .from(schema.projects)
      .where(eq(schema.projects.id, grant.projectId))
      .limit(1),
  ]);
  const brand = JSON.parse(profile?.brand || "{}") as { accent?: string };
  const shared = {
    studioName: profile?.studioName ?? "your photographer",
    accent: safeHexColor(brand.accent) ?? "#5e6ad2",
    logoUrl: profile?.logoKey && profile?.embedKey ? `/api/embed/logo?key=${profile.embedKey}` : null,
    contactEmail: profile?.contactEmail ?? null,
    whiteLabel: isWhiteLabeled(ent, profile?.brand),
    // WEB-243: honest deterrents — right-click/drag/long-press on media.
    deterrents: deterrentsOn(ent, profile?.brand),
    // WEB-242: lightbox previews swap to the watermarked variant; thumbs
    // (dashboard-only) always stay clean. Missing variant falls back to the
    // clean preview server-side until the bulk backfill covers the asset.
    watermarked: effectiveWatermark({
      ent,
      brand: profile?.brand,
      override: projectOverride[0]?.watermarkOverride ?? null,
      studioName: profile?.studioName,
    }) !== null,
  };

  // Email-shock contingency: OTPs off, the link itself is the gate.
  if (env.GALLERY_OTP_MODE === "off") {
    await logShareAccess(grant.id, "view");
    if (!(await countGalleryOpen(grant.organizationId, grant.id))) {
      return <GalleryPaused {...shared} />;
    }
    return (
      <GalleryView
        {...shared}
        assets={assets.map((a) => ({
          id: a.id,
          filename: a.filename,
          kind: a.kind,
          mimeType: a.mimeType,
          bytes: a.bytes,
          folder: a.folder,
        }))}
        allowDownload={grant.allowDownload}
        expiresAt={grant.expiresAt ? grant.expiresAt.toISOString() : null}
        selectionMode={grant.selectionMode as "off" | "favorites" | "selection"}
        selectionLimit={grant.selectionLimit ?? null}
        selectionDeadline={grant.selectionDeadline ? grant.selectionDeadline * 1000 : null}
        initialFavorites={favorites}
        submittedSelection={selection ? { items: selection.items, note: selection.note, submittedAt: selection.submittedAt.toISOString() } : null}
        clientToken={token}
      />
    );
  }

  const access = await resolveGalleryAccess(await headers());
  if (!access) {
    return (
      <GalleryGate
        {...shared}
        token={token}
        maskedEmail={maskEmail(grant.clientEmail)}
        turnstileSiteKey={env.TURNSTILE_SITE_KEY ?? ""}
      />
    );
  }

  await logShareAccess(grant.id, "view");
  if (!(await countGalleryOpen(grant.organizationId, grant.id))) {
    return <GalleryPaused {...shared} />;
  }
  return (
    <GalleryView
      {...shared}
      assets={assets.map((a) => ({
        id: a.id,
        filename: a.filename,
        kind: a.kind,
        mimeType: a.mimeType,
        bytes: a.bytes,
        folder: a.folder,
      }))}
      allowDownload={grant.allowDownload}
      expiresAt={grant.expiresAt ? grant.expiresAt.toISOString() : null}
      selectionMode={grant.selectionMode as "off" | "favorites" | "selection"}
      selectionLimit={grant.selectionLimit ?? null}
      selectionDeadline={grant.selectionDeadline ? grant.selectionDeadline * 1000 : null}
      initialFavorites={favorites}
      submittedSelection={selection ? { items: selection.items, note: selection.note, submittedAt: selection.submittedAt.toISOString() } : null}
      clientToken={token}
    />
  );
}

/** WEB-160: monthly view budget exhausted — a calm page, never broken images. */
function GalleryPaused({ studioName, contactEmail, accent }: { studioName: string; contactEmail: string | null; accent: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-md rounded-2xl border border-hairline bg-surface p-8 text-center">
        <span className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: accent }}>
          {studioName}
        </span>
        <h1 className="mt-3 text-xl font-semibold text-ink">This gallery is taking a short break</h1>
        <p className="mt-2 text-sm text-ink-subtle">
          It has been viewed an extraordinary number of times this month. Your photographer has been notified —
          check back soon, or reach out directly{contactEmail ? ` at ${contactEmail}` : ""}.
        </p>
      </div>
    </main>
  );
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  const head = local.slice(0, 1);
  return `${head}${"•".repeat(Math.max(2, Math.min(6, local.length - 1)))}@${domain}`;
}
