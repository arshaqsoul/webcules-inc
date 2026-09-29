/* Grant email delivery — the branded "your photos are ready" link email.
 * Same From pattern as lead replies (hello+{slug}@) so client replies thread
 * back into the studio's inbox via the sender trail. */
import { galleryLinkEmail, galleryOtpEmail, sendEmail } from "@/lib/email";
import { getEmailBrand } from "@/lib/branding";
import { getStudioProfile, getStudioSlug } from "@/lib/repos/studios";
import { safeHexColor } from "@/lib/embed";
import { clientWantsEmail } from "@/lib/notify-client";

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
  // WEB-136: per-studio client opt-out — the gallery itself stays live and
  // visible in the portal; only the notification email is suppressed.
  if (!(await clientWantsEmail(params.organizationId, params.clientEmail))) return false;
  const b = await getEmailBrand(params.organizationId);
  const tmpl = galleryLinkEmail(profile.studioName, {
    clientName: params.clientName,
    galleryUrl: params.galleryUrl,
    photoCount: params.photoCount,
    expiresAt: params.expiresAt,
    accent: b.accent,
    fresh: params.fresh,
    whiteLabel: b.whiteLabel,
    emailHeaderUrl: b.emailHeaderUrl,
    contactEmail: b.contactEmail,
  });
  const slug = await getStudioSlug(params.organizationId);
  return sendEmail({
    to: params.clientEmail,
    subject: tmpl.subject,
    html: tmpl.html,
    text: tmpl.text,
    fromOverride: b.whiteLabel
      ? `hello+${slug}@snap.webcules.com`
      : `${profile.studioName} via Snap <hello+${slug}@snap.webcules.com>`,
    ...(b.whiteLabel ? { fromName: profile.studioName } : {}),
    replyTo: profile.contactEmail ?? undefined,
    organizationId: params.organizationId,
    template: "gallery_link",
    refId: params.grantId,
  });
}

/** Gallery OTP code email — sent only within the WEB-132 caps. */
export async function sendGalleryOtpEmail(params: {
  organizationId: string;
  grantId: string;
  to: string;
  code: string;
}): Promise<boolean> {
  const profile = await getStudioProfile(params.organizationId);
  if (!profile) return false;
  const b = await getEmailBrand(params.organizationId);
  const tmpl = galleryOtpEmail(profile.studioName, {
    code: params.code,
    galleryUrl: "",
    accent: b.accent,
    whiteLabel: b.whiteLabel,
    emailHeaderUrl: b.emailHeaderUrl,
    contactEmail: b.contactEmail,
  });
  return sendEmail({
    to: params.to,
    subject: tmpl.subject,
    html: tmpl.html,
    text: tmpl.text,
    ...(b.whiteLabel ? { fromName: profile.studioName } : {}),
    organizationId: params.organizationId,
    template: "gallery_otp",
    refId: params.grantId,
  });
}
