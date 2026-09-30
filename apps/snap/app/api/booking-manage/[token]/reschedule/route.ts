/* Public reschedule via manage token (WEB-272). The token IS the auth
 * (256-bit, hashed at rest); rate-limited per token. The new slot is
 * re-validated by the live engine; payment state carries over. A pending
 * unpaid booking with payments enabled gets a fresh Stripe Checkout for the
 * new slot (the webhook confirms it; the old abandoned session can only
 * confirm the same booking). */
import { z } from "zod";
import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { getBookingSettings } from "@/lib/repos/availability";
import { effectiveBookingPayment } from "@/lib/repos/session-types";
import { getStudioProfile } from "@/lib/repos/studios";
import {
  MANAGE_TOKEN_RE,
  checkManageRate,
  notifyRescheduled,
  rescheduleBooking,
  resolveBookingByManageToken,
} from "@/lib/repos/booking-manage";
import { clientIp } from "@/lib/shares/gallery-auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  slotStart: z.string().datetime(),
});

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!MANAGE_TOKEN_RE.test(token)) return Response.json({ error: "not_found" }, { status: 404 });
  if (!(await checkManageRate(token))) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }

  const booking = await resolveBookingByManageToken(token);
  if (!booking) return Response.json({ error: "not_found" }, { status: 404 });

  const result = await rescheduleBooking({
    organizationId: booking.organizationId,
    bookingId: booking.id,
    slotStartIso: body.slotStart,
    actor: { type: "client-token" },
    enforceCutoff: true,
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });
  if (!result.ok) {
    const status = { not_found: 404, canceled: 409, cutoff_passed: 403, slot_unavailable: 400, conflict: 409 }[result.error];
    return Response.json({ error: result.error }, { status });
  }

  // Unpaid hold + payments enabled → re-offer checkout at the new slot. Only
  // for pending bookings: confirmBookingPaid completes the webhook flow for
  // them, while a confirmed-unpaid booking is invoiced later, not charged.
  const settings = await getBookingSettings(booking.organizationId);
  const type = result.booking.sessionTypeId
    ? ((await getDb().select().from(schema.sessionTypes).where(eq(schema.sessionTypes.id, result.booking.sessionTypeId)).limit(1))[0] ?? null)
    : null;
  const payment = effectiveBookingPayment(settings, type);
  if (result.booking.status === "pending" && payment?.enabled) {
    const stripe = await getStripe();
    if (stripe) {
      try {
        const url = new URL(req.url);
        const profile = await getStudioProfile(booking.organizationId);
        let transferData: { destination: string } | undefined;
        if (profile?.stripeAccountId && profile.stripeConnectState === "active") {
          transferData = { destination: profile.stripeAccountId };
        }
        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          customer_email: result.booking.clientEmail,
          line_items: [
            {
              price_data: {
                currency: "usd",
                unit_amount: payment.amountMinor,
                product_data: {
                  name:
                    payment.kind === "deposit"
                      ? `Session deposit — ${profile?.studioName ?? "studio"}`
                      : `Session payment — ${profile?.studioName ?? "studio"}`,
                },
              },
              quantity: 1,
            },
          ],
          metadata: { bookingId: booking.id, organizationId: booking.organizationId },
          success_url: `${url.origin}/booking/success?booking=${booking.id}`,
          cancel_url: `${url.origin}/booking/${token}`,
          ...(transferData ? { payment_intent_data: { transfer_data: transferData } } : {}),
        });
        return Response.json({ ok: true, checkoutUrl: session.url });
      } catch (err) {
        // The booking has already MOVED — a Stripe hiccup must not 500 the
        // response and make the client think the reschedule failed.
        console.error("manage reschedule: checkout re-offer failed:", String(err));
      }
    }
  }

  // The ICS route regenerates from the live booking row (existing public
  // model — embed key arrives as a query param in emails/pages); the link in
  // the reschedule email is therefore always current.
  const origin = new URL(req.url).origin;
  const embedKey = (await getStudioProfile(booking.organizationId))?.embedKey ?? "";
  await notifyRescheduled({
    booking: result.booking,
    previousStartAt: result.previousStartAt,
    endAt: result.booking.endAt,
    urls: {
      manageUrl: `${origin}/booking/${token}`,
      icsUrl: `${origin}/api/embed/ics?booking=${booking.id}&key=${embedKey}`,
    },
    initiator: "client",
  });
  return Response.json({ ok: true });
}
