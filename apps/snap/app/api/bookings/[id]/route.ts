/* Booking cancellation (org-context guarded) — frees the slot via the partial
 * index and emails the client. */
import { bookingCanceledEmail, sendEmail } from "@/lib/email";
import { isWhiteLabeled } from "@/lib/branding";
import { safeHexColor } from "@/lib/embed";
import { getPlanEntitlements } from "@/lib/plans";
import { cancelBooking } from "@/lib/repos/bookings";
import { getStudioProfile } from "@/lib/repos/studios";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const result = await cancelBooking(ctx.organizationId, id, ctx.user.id);
  if (!result.ok) return Response.json({ error: result.error }, { status: 404 });

  const profile = await getStudioProfile(ctx.organizationId);
  if (profile) {
    const accent = safeHexColor(JSON.parse(profile.brand || "{}").accent) ?? "#5e6ad2";
    const wl = isWhiteLabeled(await getPlanEntitlements(ctx.organizationId), profile.brand);
    const template = bookingCanceledEmail(profile.studioName, {
      clientName: result.booking.clientName ?? result.booking.clientEmail,
      startAt: result.booking.startAt,
      tz: result.booking.timezone,
      accent,
      whiteLabel: wl,
    });
    await sendEmail({
      to: result.booking.clientEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
      ...(wl ? { fromName: profile.studioName } : {}),
      organizationId: ctx.organizationId,
      template: "booking.canceled_client",
      refId: result.booking.id,
    });
  }
  return Response.json({ ok: true });
}
