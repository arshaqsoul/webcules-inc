/* Public client-upload page at /u/{token} (WEB-182, Integrations 5/6).
 * Token possession is the capability — no login, no OTP (the link is
 * single-purpose and revocable, unlike a gallery). The link state is
 * re-validated on every render: closed/expired links show the right
 * message, unknown tokens 404. Uploads go browser→R2 direct through the
 * same presigned pipeline the studio uses and land in quarantine. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { UploadRequestView } from "@/components/upload-request-view";
import { isWhiteLabeled } from "@/lib/branding";
import { brandIcons, parseBrandAssets } from "@/lib/brand-assets";
import { getPlanEntitlements } from "@/lib/plans";
import { getStudioProfile } from "@/lib/repos/studios";
import { safeHexColor } from "@/lib/embed";
import {
  GUEST_MAX_FILE_BYTES,
  effectiveFileCap,
  getUploadRequestByToken,
  uploadRequestState,
} from "@/lib/shares/upload-requests";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Upload photos", robots: { index: false } };

const TOKEN_RE = /^[A-Za-z0-9_-]{20,120}$/;

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return {};
  const request = await getUploadRequestByToken(token);
  if (!request) return {};
  const profile = await getStudioProfile(request.organizationId);
  if (!profile) return {};
  const bag = parseBrandAssets(profile.brandAssets);
  return {
    ...(isWhiteLabeled(await getPlanEntitlements(request.organizationId), profile.brand)
      ? { title: { absolute: `Upload photos · ${profile.studioName}` } }
      : {}),
    ...(brandIcons(bag, request.organizationId) ? { icons: brandIcons(bag, request.organizationId) } : {}),
    robots: { index: false },
  };
}

export default async function UploadRequestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) notFound();
  const request = await getUploadRequestByToken(token);
  if (!request) notFound();

  const profile = await getStudioProfile(request.organizationId);
  if (!profile) notFound();
  const brand = JSON.parse(profile.brand || "{}") as { accent?: string };
  const accent = safeHexColor(brand.accent) ?? "#5e6ad2";
  const state = uploadRequestState(request);

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <div className="overflow-hidden rounded-2xl border border-hairline bg-surface">
        <div className="px-6 py-6" style={{ background: `${accent}14` }}>
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: accent }}>
            {profile.studioName}
          </p>
          <h1 className="mt-1 text-xl font-semibold text-ink">{request.title}</h1>
          <p className="mt-1 text-sm text-ink-subtle">
            {state === "open"
              ? "Add your photos and videos — they go straight to the studio for review before anyone sees them."
              : state === "closed"
                ? "This upload link is closed. Contact the studio if you still have photos to share."
                : "This upload link has expired. Contact the studio if you still have photos to share."}
          </p>
        </div>
        {state === "open" && (
          <UploadRequestView
            token={token}
            accent={accent}
            maxBytes={GUEST_MAX_FILE_BYTES}
            remaining={Math.max(0, effectiveFileCap(request) - request.uploadedCount)}
            studioName={profile.studioName}
          />
        )}
      </div>
      <p className="mt-4 text-center text-xs text-ink-subtle">
        Powered by Snap — photos are reviewed by the studio before they appear anywhere.
      </p>
    </main>
  );
}
