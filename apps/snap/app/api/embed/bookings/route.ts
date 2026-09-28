/* Public booking creation from the calendar widget. Slot is re-validated by
 * the engine; the partial unique index (0004) is the hard double-book guard. */
import { z } from "zod";

import { originAllowed, resolveStudioByEmbedKey, safeHexColor } from "@/lib/embed";
import { bookingConfirmedEmails, sendEmail } from "@/lib/email";
import { getBookingSettings } from "@/lib/repos/availability";
import { createBookingFromWidget } from "@/lib/repos/bookings";
import { getStudioProfile } from "@/lib/repos/studios";
import { getStripe } from "@/lib/stripe";
import { verifyTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  slotStart: z.string().datetime(),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  embedOrigin: z.string().trim().max(200).optional().or(z.literal("")),
  turnstileToken: z.string().max(4096).optional(),
});

export async function POST(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? "";
  const studio = await resolveStudioByEmbedKey(key);
  if (!studio) return Response.json({ error: "invalid_key" }, { status: 404 });
  if (!originAllowed(studio, req.headers.get("Origin") ?? null)) {
    // iframe same-origin fetches carry snap's own Origin; accept those, the
    // widget passes the referrer-derived origin in the payload too.
    const declaredOrigin = null; // validated via payload below
    void declaredOrigin;
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }
  if (!originAllowed(studio, body.embedOrigin || null) && !originAllowed(studio, req.headers.get("Origin"))) {
    return Response.json({ error: "origin_not_allowed" }, { status: 403 });
  }
  const ip = req.headers.get("CF-Connecting-IP");
  if (!(await verifyTurnstile(body.turnstileToken, ip))) {
    return Response.json({ error: "captcha_failed" }, { status: 403 });
  }

  // Payment-required studios: hold the booking pending and hand back a
  // Stripe Checkout URL — the webhook confirms and finishes the flow.
  const settings = await getBookingSettings(studio.organizationId);
  if (settings.payment?.enabled) {
    const stripe = await getStripe();
    if (stripe) {
      const held = await createBookingFromWidget({
        organizationId: studio.organizationId,
        slotStartIso: body.slotStart,
        clientName: body.name,
        clientEmail: body.email,
        clientPhone: body.phone || null,
        notes: body.notes || null,
        pendingWhenPaymentRequired: true,
      });
      if (!held.ok) {
        const status = held.error === "conflict" ? 409 : 400;
        return Response.json({ error: held.error }, { status });
      }

      // Connected studios (active Express account) get a DESTINATION charge —
      // money lands in the photographer's balance, platform takes $0
      // (application_fee_amount omitted = 0). Unconnected/pending studios
      // fall back to the platform account (founder-approved testing phase);
      // if a stale "active" cache fails at Stripe, retry once as platform.
      const profile = await getStudioProfile(studio.organizationId);
      let transferData: { destination: string } | undefined;
      if (profile?.stripeAccountId && profile.stripeConnectState === "active") {
        transferData = { destination: profile.stripeAccountId };
      }
      const sessionArgs = {
        mode: "payment" as const,
        customer_email: body.email.toLowerCase(),
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: settings.payment.amountMinor,
              product_data: {
                name:
                  settings.payment.kind === "deposit"
                    ? `Session deposit — ${studio.studioName}`
                    : `Session payment — ${studio.studioName}`,
              },
            },
            quantity: 1,
          },
        ],
        metadata: { bookingId: held.bookingId, organizationId: studio.organizationId },
        success_url: `${url.origin}/booking/success?booking=${held.bookingId}`,
        cancel_url: `${url.origin}/booking/cancel?booking=${held.bookingId}`,
        ...(transferData ? { payment_intent_data: { transfer_data: transferData } } : {}),
      };
      let session;
      try {
        session = await stripe.checkout.sessions.create(sessionArgs);
      } catch (err) {
        if (transferData && /destination|transfers/i.test(String(err))) {
          console.error("connect destination charge failed — falling back to platform account:", String(err));
          session = await stripe.checkout.sessions.create({ ...sessionArgs, payment_intent_data: undefined });
        } else {
          throw err;
        }
      }
      return Response.json({ ok: true, requiresPayment: true, checkoutUrl: session.url });
    }
  }

  const result = await createBookingFromWidget({
    organizationId: studio.organizationId,
    slotStartIso: body.slotStart,
    clientName: body.name,
    clientEmail: body.email,
    clientPhone: body.phone || null,
    notes: body.notes || null,
  });
  if (!result.ok) {
    const status = result.error === "conflict" ? 409 : 400;
    return Response.json({ error: result.error }, { status });
  }

  // Confirmation emails (+ ICS link) — failures never break the booking.
  const profile = await getStudioProfile(studio.organizationId);
  const accent = safeHexColor(studio.brand.accent) ?? "#5e6ad2";
  const bookingStart = new Date(body.slotStart);
  const icsUrl = `${url.origin}/api/embed/ics?booking=${result.bookingId}&key=${studio.embedKey}`;
  const templates = bookingConfirmedEmails(studio.studioName, {
    clientName: body.name,
    startAt: bookingStart,
    endAt: new Date(bookingStart.getTime() + 60 * 60_000),
    tz: profile?.timezone ?? "UTC",
    icsUrl,
    accent,
  });
  await Promise.all([
    sendEmail({
      to: body.email.toLowerCase(),
      subject: templates.client.subject,
      html: templates.client.html,
      text: templates.client.text,
      organizationId: studio.organizationId,
      template: "booking.confirmed_client",
      refId: result.bookingId,
    }),
    profile?.contactEmail
      ? sendEmail({
          to: profile.contactEmail,
          subject: templates.studio.subject,
          html: templates.studio.html,
          text: templates.studio.text,
          replyTo: body.email.toLowerCase(),
          organizationId: studio.organizationId,
          template: "booking.confirmed_studio",
          refId: result.bookingId,
        })
      : Promise.resolve(false),
  ]);

  return Response.json({ ok: true, bookingRef: result.bookingId });
}
