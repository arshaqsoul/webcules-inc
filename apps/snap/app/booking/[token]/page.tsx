/* Public manage-booking page at /booking/{token} (WEB-272) — the email's
 * "Manage booking" destination. Studio-branded, white-label aware; shows
 * exactly what the client already knows (session type, time, payment state,
 * studio contact — never org internals). Reschedule embeds the same calendar
 * widget in manage mode; cancel is cutoff-gated with the refund-policy path
 * for prepaid sessions. Token status is re-resolved on EVERY render:
 * revocation kills the page mid-session. */
import type { Metadata } from "next";

import { BookingManageDenied, BookingManageView } from "@/components/booking-manage-view";
import { isWhiteLabeled } from "@/lib/branding";
import { getPlanEntitlements } from "@/lib/plans";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { safeHexColor } from "@/lib/embed";
import {
  MANAGE_TOKEN_RE,
  getBookingByManageTokenAny,
  getBookingPolicy,
  resolveBookingByManageToken,
  withinCutoff,
} from "@/lib/repos/booking-manage";
import { getStudioProfile } from "@/lib/repos/studios";

export const dynamic = "force-dynamic";

const TOKEN_RE = MANAGE_TOKEN_RE;

export const metadata: Metadata = { title: "Manage your booking", robots: { index: false } };

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return { robots: { index: false } };
  const booking = await resolveBookingByManageToken(token);
  if (!booking) return { robots: { index: false } };
  const profile = await getStudioProfile(booking.organizationId);
  if (!profile) return { robots: { index: false } };
  const wl = isWhiteLabeled(await getPlanEntitlements(booking.organizationId), profile.brand);
  return {
    // Absolute skips the root layout's "· Snap" suffix for white-labeled studios.
    ...(wl ? { title: { absolute: `Manage your booking · ${profile.studioName}` } } : {}),
    robots: { index: false },
  };
}

export default async function BookingManagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) {
    return <BookingManageDenied reason="unknown" />;
  }

  const booking = await resolveBookingByManageToken(token);

  // Dead-but-known link → branded denial (the studio can re-issue from the
  // calendar); unknown token → neutral denial.
  if (!booking) {
    const dead = await getBookingByManageTokenAny(token);
    if (dead) {
      const profile = await getStudioProfile(dead.organizationId);
      const brand = JSON.parse(profile?.brand || "{}") as { accent?: string };
      return (
        <BookingManageDenied
          reason="dead"
          studioName={profile?.studioName}
          contactEmail={profile?.contactEmail ?? null}
          accent={safeHexColor(brand.accent) ?? "#5e6ad2"}
        />
      );
    }
    return <BookingManageDenied reason="unknown" />;
  }

  const [profile, policy] = await Promise.all([
    getStudioProfile(booking.organizationId),
    getBookingPolicy(booking.organizationId),
  ]);
  const brand = JSON.parse(profile?.brand || "{}") as { accent?: string };
  const sessionType = booking.sessionTypeId
    ? ((await getDb().select({ name: schema.sessionTypes.name }).from(schema.sessionTypes).where(eq(schema.sessionTypes.id, booking.sessionTypeId)).limit(1))[0]?.name ?? null)
    : null;
  const wl = isWhiteLabeled(await getPlanEntitlements(booking.organizationId), profile?.brand);
  const reschedule = withinCutoff(booking.startAt, policy.rescheduleCutoffHours);
  const cancel = withinCutoff(booking.startAt, policy.cancelCutoffHours);

  return (
    <BookingManageView
      studioName={profile?.studioName ?? "your studio"}
      accent={safeHexColor(brand.accent) ?? "#5e6ad2"}
      logoUrl={profile?.logoKey && profile?.embedKey ? `/api/embed/logo?key=${profile.embedKey}` : null}
      contactEmail={profile?.contactEmail ?? null}
      whiteLabel={wl}
      sessionTypeName={sessionType}
      startAtIso={booking.startAt.toISOString()}
      endAtIso={booking.endAt.toISOString()}
      tz={booking.timezone}
      status={booking.status}
      paymentStatus={booking.paymentStatus}
      rescheduleAllowed={reschedule.allowed}
      cancelAllowed={cancel.allowed}
      refundPolicyText={policy.refundPolicyText}
      embedKey={profile?.embedKey ?? ""}
      manageToken={token}
      rescheduledFromIso={booking.previousStartAt ? booking.previousStartAt.toISOString() : null}
      icsUrl={profile?.embedKey && booking.status !== "canceled" ? `/api/embed/ics?booking=${booking.id}&key=${profile.embedKey}` : null}
    />
  );
}
