/* Public client gallery at /g/{token} (WEB-125). The grant's status and
 * expiry are re-validated on EVERY render — revocation or expiry kills the
 * page mid-session. No better-auth session is involved: access is either the
 * OTP-verified snap-g cookie (WEB-132) or, under the email-shock contingency
 * (GALLERY_OTP_MODE=off), link possession alone. */
import { headers } from "next/headers";
import { env } from "cloudflare:workers";

import { GalleryDenied, GalleryGate, GalleryView } from "@/components/gallery-view";
import { getStudioProfile } from "@/lib/repos/studios";
import { logShareAccess, resolveGalleryAccess } from "@/lib/shares/gallery-auth";
import { getGrantAssets, getGrantByTokenHashAny, resolveGrantByToken } from "@/lib/shares/grants";
import { safeHexColor } from "@/lib/embed";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your gallery", robots: { index: false } };

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
        />
      );
    }
    return <GalleryDenied reason="unknown" />;
  }

  const [profile, assets] = await Promise.all([
    getStudioProfile(grant.organizationId),
    getGrantAssets(grant),
  ]);
  const brand = JSON.parse(profile?.brand || "{}") as { accent?: string };
  const shared = {
    studioName: profile?.studioName ?? "your photographer",
    accent: safeHexColor(brand.accent) ?? "#5e6ad2",
    logoUrl: profile?.logoKey && profile?.embedKey ? `/api/embed/logo?key=${profile.embedKey}` : null,
    contactEmail: profile?.contactEmail ?? null,
  };

  // Email-shock contingency: OTPs off, the link itself is the gate.
  if (env.GALLERY_OTP_MODE === "off") {
    await logShareAccess(grant.id, "view");
    return (
      <GalleryView
        {...shared}
        assets={assets.map((a) => ({
          id: a.id,
          filename: a.filename,
          kind: a.kind,
          mimeType: a.mimeType,
          bytes: a.bytes,
        }))}
        allowDownload={grant.allowDownload}
        expiresAt={grant.expiresAt ? grant.expiresAt.toISOString() : null}
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
  return (
    <GalleryView
      {...shared}
      assets={assets.map((a) => ({
        id: a.id,
        filename: a.filename,
        kind: a.kind,
        mimeType: a.mimeType,
        bytes: a.bytes,
      }))}
      allowDownload={grant.allowDownload}
      expiresAt={grant.expiresAt ? grant.expiresAt.toISOString() : null}
    />
  );
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  const head = local.slice(0, 1);
  return `${head}${"•".repeat(Math.max(2, Math.min(6, local.length - 1)))}@${domain}`;
}
