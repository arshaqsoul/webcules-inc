/* Public booking creation from the calendar widget. Slot is re-validated by
 * the engine; the partial unique index (0004) is the hard double-book guard. */
import { z } from "zod";

import { originAllowed, resolveStudioByEmbedKey, safeHexColor } from "@/lib/embed";
import { bookingConfirmedEmails, icsCopyFor, sendEmail } from "@/lib/email";
import { getEmailBrand } from "@/lib/branding";
import { buildSingleEventIcs, icsAttachment } from "@/lib/ics";
import { getBookingSettings } from "@/lib/repos/availability";
import { effectiveBookingPayment, getSessionTypeBySlug } from "@/lib/repos/session-types";
import { getTemplate } from "@/lib/repos/templates";
import { parseFormSchema, validateFormAnswers } from "@/lib/forms";
import { createBookingFromWidget, getBookingByRef } from "@/lib/repos/bookings";
import { ensureManageToken } from "@/lib/repos/booking-manage";
import { getStudioProfile } from "@/lib/repos/studios";
import { notificationPrefValue } from "@/lib/notify-client";
import { getStripe } from "@/lib/stripe";
import { chargeAccountId, onAccount } from "@/lib/connect";
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
  sessionType: z.string().trim().max(40).optional().or(z.literal("")),
  answers: z.record(z.string(), z.string().max(4000)).optional(),
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

  // WEB-250: resolve the session type (slug) and validate booking answers
  // against the STORED template schema.
  const type = body.sessionType ? await getSessionTypeBySlug(studio.organizationId, body.sessionType) : null;
  if (body.sessionType && !type) return Response.json({ error: "invalid_session_type" }, { status: 400 });
  let answersJson: string | null = null;
  if (type?.bookingFormTemplateId) {
    const template = await getTemplate(studio.organizationId, type.bookingFormTemplateId);
    const formSchema = template && !template.archivedAt ? parseFormSchema(template.body) : null;
    if (formSchema) {
      const validated = validateFormAnswers(formSchema, body.answers ?? {});
      if (!validated.ok) return Response.json({ error: "invalid_answers", fields: validated.errors.map((e) => e.field) }, { status: 400 });
      answersJson = JSON.stringify(validated.result);
    }
  } else if (body.answers && Object.keys(body.answers).length) {
    return Response.json({ error: "invalid_answers" }, { status: 400 }); // no questions on this type
  }

  // Payment-required studios: hold the booking pending and hand back a
  // Stripe Checkout URL — the webhook confirms and finishes the flow.
  // WEB-250: the type's deposit config overrides the org-level one.
  const settings = await getBookingSettings(studio.organizationId);
  const payment = effectiveBookingPayment(settings, type);
  if (payment?.enabled) {
    const stripe = await getStripe();
    if (stripe) {
      // WEB-352: payments settle in the studio's own Stripe account only. A studio that
      // requires payment but has no active account cannot take a paid booking; refuse
      // BEFORE holding a slot rather than charging the platform account.
      const chargeProfile = await getStudioProfile(studio.organizationId);
      const chargeAccount = chargeAccountId(chargeProfile);
      if (!chargeAccount) return Response.json({ error: "payments_unavailable" }, { status: 409 });
      const held = await createBookingFromWidget({
        organizationId: studio.organizationId,
        slotStartIso: body.slotStart,
        clientName: body.name,
        clientEmail: body.email,
        clientPhone: body.phone || null,
        notes: body.notes || null,
        pendingWhenPaymentRequired: true,
        ...(type ? { sessionTypeId: type.id } : {}),
        ...(answersJson ? { answers: answersJson } : {}),
      });
      if (!held.ok) {
        const status = held.error === "conflict" ? 409 : 400;
        return Response.json({ error: held.error }, { status });
      }

      // WEB-352: client money is charged DIRECTLY on the studio's own Stripe
      // account - the studio's Stripe takes the payment and pays the Stripe
      // fee; Snap's platform account is never charged and never receives
      // client money. There is no platform fallback: see the guard above.
      const sessionArgs = {
        mode: "payment" as const,
        customer_email: body.email.toLowerCase(),
        line_items: [
          {
            price_data: {
              currency: chargeProfile?.paymentCurrency ?? "usd",
              unit_amount: payment.amountMinor,
              product_data: {
                name:
                  payment.kind === "deposit"
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
      };
      const session = await stripe.checkout.sessions.create(sessionArgs, onAccount(chargeAccount));
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
    ...(type ? { sessionTypeId: type.id } : {}),
    ...(answersJson ? { answers: answersJson } : {}),
  });
  if (!result.ok) {
    const status = result.error === "conflict" ? 409 : 400;
    return Response.json({ error: result.error }, { status });
  }

  // Confirmation emails (+ ICS link + attached invite — WEB-273) — failures
  // never break the booking. The manage token is minted up front so both the
  // email link and any later re-issue resolve to this booking from the first
  // send.
  const profile = await getStudioProfile(studio.organizationId);
  const accent = safeHexColor(studio.brand.accent) ?? "#5e6ad2";
  const bookingStart = new Date(body.slotStart);
  const icsUrl = `${url.origin}/api/embed/ics?booking=${result.bookingId}&key=${studio.embedKey}`;
  const manageToken = await ensureManageToken(result.bookingId);
  const manageUrl = manageToken ? `${url.origin}/booking/${manageToken}` : null;
  const bookingRow = await getBookingByRef(result.bookingId);
  const b = await getEmailBrand(studio.organizationId);
  const templates = bookingConfirmedEmails(studio.studioName, {
    clientName: body.name,
    startAt: bookingStart,
    endAt: bookingRow?.endAt ?? new Date(bookingStart.getTime() + 60 * 60_000),
    tz: profile?.timezone ?? "UTC",
    icsUrl,
    accent,
    whiteLabel: b.whiteLabel,
    emailHeaderUrl: b.emailHeaderUrl,
    contactEmail: b.contactEmail,
    ...(manageUrl ? { manageUrl } : {}),
  });
  const icsAttach = bookingRow
    ? icsAttachment(
        buildSingleEventIcs({
          uid: bookingRow.id,
          startAt: bookingRow.startAt,
          endAt: bookingRow.endAt,
          ...icsCopyFor(studio.studioName, { sessionTypeName: type?.name ?? null, manageUrl, whiteLabel: b.whiteLabel }),
          status: "CONFIRMED",
        }),
        bookingRow.id,
      )
    : undefined;
  await Promise.all([
    sendEmail({
      to: body.email.toLowerCase(),
      subject: templates.client.subject,
      html: templates.client.html,
      text: templates.client.text,
      ...(b.whiteLabel ? { fromName: studio.studioName } : {}),
      organizationId: studio.organizationId,
      template: "booking.confirmed_client",
      refId: result.bookingId,
      ...(icsAttach ? { attachments: [icsAttach] } : {}),
    }),
    profile?.contactEmail && notificationPrefValue(profile.notificationPrefs, "booking")
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
