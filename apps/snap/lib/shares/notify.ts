/* Grant email delivery — the branded "your photos are ready" link email.
 * Same From pattern as lead replies (hello+{slug}@) so client replies thread
 * back into the studio's inbox via the sender trail. */
import { galleryLinkEmail, sendEmail } from "@/lib/email";
import { getStudioProfile, getStudioSlug } from "@/lib/repos/studios";
import { safeHexColor } from "@/lib/embed";

export async function sendGrantEmail(params: {
  organizationId: string;
  clientEmail: string;
  clientName: string;
  galleryUrl: string;
  photoCount: number;
  expiresAt: Date | null;
  grantId: string;
  fresh: boolean;
}): Promise<boolean> {
  const profile = await getStudioProfile(params.organizationId);
  if (!profile) return false;
  const brand = JSON.parse(profile.brand || "{}") as { accent?: string };
  const accent = safeHexColor(brand.accent) ?? "#5e6ad2";
  const tmpl = galleryLinkEmail(profile.studioName, {
    clientName: params.clientName,
    galleryUrl: params.galleryUrl,
    photoCount: params.photoCount,
    expiresAt: params.expiresAt,
    accent,
    fresh: params.fresh,
  });
  const slug = await getStudioSlug(params.organizationId);
  return sendEmail({
    to: params.clientEmail,
    subject: tmpl.subject,
    html: tmpl.html,
    text: tmpl.text,
    fromOverride: `${profile.studioName} via Snap <hello+${slug}@snap.webcules.com>`,
    replyTo: profile.contactEmail ?? undefined,
    organizationId: params.organizationId,
    template: "gallery_link",
    refId: params.grantId,
  });
}
