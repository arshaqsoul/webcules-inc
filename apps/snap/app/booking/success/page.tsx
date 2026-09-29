import Link from "next/link";

import { getBookingByRef } from "@/lib/repos/bookings";
import { getStudioProfile } from "@/lib/repos/studios";
import { parseBookingPageConfig } from "@/lib/booking-page";
import { clientUrl } from "@/lib/client-urls";

export const metadata = { title: "Booking confirmed" };

export default async function BookingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string }>;
}) {
  const { booking: bookingId } = await searchParams;
  // WEB-254: the studio's thank-you copy when we can resolve the booking.
  let title = "You're booked!";
  let body = "Your payment went through and your session is confirmed. A confirmation email with a calendar link is on its way to your inbox.";
  let studioName: string | null = null;
  let portalUrl: string | null = null;
  if (bookingId) {
    const booking = await getBookingByRef(bookingId);
    if (booking && booking.status !== "canceled") {
      const profile = await getStudioProfile(booking.organizationId);
      studioName = profile?.studioName ?? null;
      const page = parseBookingPageConfig(profile?.bookingPage ?? null);
      if (page.thanks.title || page.thanks.body) {
        if (page.thanks.title) title = page.thanks.title;
        if (page.thanks.body) body = page.thanks.body;
      }
      portalUrl = await clientUrl(booking.organizationId, "/portal");
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-[12px] border border-hairline bg-surface-1 p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-2xl">✓</div>
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-subtle">{body}</p>
        {portalUrl && (
          <p className="mt-3 text-xs text-ink-subtle">
            Everything about your session lives in your{" "}
            <a href={portalUrl} className="font-medium text-primary hover:underline">
              client portal
            </a>
            {studioName ? ` with ${studioName}` : ""}.
          </p>
        )}
        <Link href="/" className="mt-6 inline-block text-sm text-primary hover:underline">
          Back to snap.webcules.com
        </Link>
      </div>
    </main>
  );
}
