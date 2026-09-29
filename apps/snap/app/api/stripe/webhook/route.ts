/* Stripe webhook — raw-body signature verification (Web Crypto via
 * constructEventAsync), idempotent processing keyed by event id.
 *
 * Events (register exactly these in Stripe):
 *   checkout.session.completed      → booking payment confirmed
 *   payment_intent.payment_failed   → payment marked failed
 *   charge.refunded                 → refund: payment refunded + booking + project canceled + email
 *   charge.dispute.created          → payment flagged disputed (refunds frozen)
 *   charge.dispute.closed           → dispute outcome recorded (won restores, lost stays flagged)
 *   account.updated                 → Connect onboarding state refresh (Epic 14)
 */
import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { env } from "cloudflare:workers";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { refundClientEmail, sendEmail } from "@/lib/email";
import { isWhiteLabeled } from "@/lib/branding";
import { safeHexColor } from "@/lib/embed";
import { getPlanEntitlements } from "@/lib/plans";
import { applySubscriptionState } from "@/lib/billing";
import { cancelBooking, confirmBookingPaid } from "@/lib/repos/bookings";
import { getStudioProfile } from "@/lib/repos/studios";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const stripe = await getStripe();
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return Response.json({ error: "stripe_not_configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "missing_signature" }, { status: 400 });
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("stripe webhook signature verification failed:", String(err));
    return Response.json({ error: "invalid_signature" }, { status: 400 });
  }

  // Idempotency: skip events we've already processed.
  const db = getDb();
  const seen = (
    await db
      .select({ id: schema.auditLog.id })
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.organizationId, "__stripe__"),
          eq(schema.auditLog.action, "stripe.event"),
          eq(schema.auditLog.meta, JSON.stringify({ id: event.id })),
        ),
      )
      .limit(1)
  )[0];
  if (seen) return Response.json({ received: true, duplicate: true });
  await db.insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: null,
    actorType: "system",
    action: "stripe.event",
    targetType: "stripe_event",
    targetId: event.id,
    meta: JSON.stringify({ id: event.id, type: event.type }),
  });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // Snap plan subscription checkout (WEB-152) — distinct from bookings.
        if (session.mode === "subscription" && session.metadata?.kind === "plan_checkout") {
          const organizationId = session.metadata.organizationId;
          const subId = typeof session.subscription === "string" ? session.subscription : null;
          if (organizationId && subId) {
            const sub = await (await getStripe())!.subscriptions.retrieve(subId);
            await applySubscriptionState(sub);
          }
          break;
        }

        // WEB-174: invoice Payment Link checkout — flip the invoice paid.
        if (session.metadata?.kind === "invoice") {
          const { markInvoicePaidFromSession } = await import("@/lib/invoices");
          await markInvoicePaidFromSession({
            id: session.id,
            payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : null,
            amount_total: session.amount_total ?? null,
            currency: session.currency ?? null,
            metadata: session.metadata,
          });
          break;
        }

        const bookingId = session.metadata?.bookingId;
        const organizationId = session.metadata?.organizationId;
        if (bookingId && organizationId) {
          await confirmBookingPaid({
            bookingId,
            organizationId,
            stripePaymentIntentId:
              typeof session.payment_intent === "string" ? session.payment_intent : null,
            amountMinor: session.amount_total ?? null,
            currency: session.currency ?? null,
          });
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const intent = event.data.object as Stripe.PaymentIntent;
        await db
          .update(schema.payments)
          .set({ status: "failed" })
          .where(eq(schema.payments.stripePaymentIntentId, intent.id));
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
        if (!intentId) break;
        const payment = (
          await db
            .select()
            .from(schema.payments)
            .where(eq(schema.payments.stripePaymentIntentId, intentId))
            .limit(1)
        )[0];
        if (!payment) break;

        // Booking sits on the payment's project (booking.projectId ↔ project.bookingId).
        const project = (
          await db
            .select({ bookingId: schema.projects.bookingId, status: schema.projects.status, title: schema.projects.title })
            .from(schema.projects)
            .where(eq(schema.projects.id, payment.projectId))
            .limit(1)
        )[0];
        const booking = project?.bookingId
          ? (
              await db
                .select()
                .from(schema.bookings)
                .where(eq(schema.bookings.id, project.bookingId))
                .limit(1)
            )[0]
          : undefined;

        // WEB-141: the refund cancels the whole project too — otherwise it
        // lingers and the cron keeps advancing it. Canceled/closed projects
        // keep their status (a closed project with a late refund stays closed).
        const cancelProject = (() => {
          if (!project || ["canceled", "closed"].includes(project.status)) return [];
          return [
            db
              .update(schema.projects)
              .set({ status: "canceled", updatedAt: new Date() })
              .where(eq(schema.projects.id, payment.projectId)),
            db.insert(schema.projectStatusEvents).values({
              id: crypto.randomUUID(),
              organizationId: payment.organizationId,
              projectId: payment.projectId,
              fromStatus: project.status,
              toStatus: "canceled",
              actorId: null,
              note: "Automatic: refund issued",
            }),
            db.insert(schema.auditLog).values({
              id: crypto.randomUUID(),
              organizationId: payment.organizationId,
              actorType: "system",
              action: "project.auto_canceled_refund",
              targetType: "project",
              targetId: payment.projectId,
              meta: JSON.stringify({ paymentId: payment.id }),
            }),
          ];
        })();

        await db.batch([
          db
            .update(schema.payments)
            .set({ status: "refunded" })
            .where(eq(schema.payments.id, payment.id)),
          ...(booking
            ? [
                db
                  .update(schema.bookings)
                  .set({ status: "canceled", paymentStatus: "unpaid", updatedAt: new Date() })
                  .where(eq(schema.bookings.id, booking.id)),
              ]
            : []),
          ...cancelProject,
        ]);

        // Canceled bookings free their slot (conflict query excludes canceled).
        // WEB-141: the email states what happens to the booking, the project,
        // and its content (deleted vs galleries-until-expiry).
        const profile = await getStudioProfile(payment.organizationId);
        if (profile && booking) {
          const accent = safeHexColor(JSON.parse(profile.brand || "{}").accent) ?? "#5e6ad2";
          const wl = isWhiteLabeled(await getPlanEntitlements(payment.organizationId), profile.brand);
          const contentDeleted =
            (
              await db
                .select({ id: schema.auditLog.id })
                .from(schema.auditLog)
                .where(
                  and(
                    eq(schema.auditLog.organizationId, payment.organizationId),
                    eq(schema.auditLog.action, "project.content_deleted"),
                    eq(schema.auditLog.targetType, "project"),
                    eq(schema.auditLog.targetId, payment.projectId),
                  ),
                )
                .limit(1)
            ).length > 0;
          const amountLabel = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: payment.currency.toUpperCase(),
          }).format(payment.amountMinor / 100);
          const template = refundClientEmail(profile.studioName, {
            clientName: booking.clientName ?? booking.clientEmail,
            startAt: booking.startAt,
            tz: booking.timezone,
            accent,
            amountLabel,
            projectTitle: project?.title ?? null,
            contentDeleted,
            whiteLabel: wl,
          });
          await sendEmail({
            to: booking.clientEmail,
            subject: template.subject,
            html: template.html,
            text: template.text,
            ...(wl ? { fromName: profile.studioName } : {}),
            organizationId: payment.organizationId,
            template: "booking.refund_client",
            refId: booking.id,
          });
        }
        break;
      }
      case "charge.dispute.created":
      case "charge.dispute.closed": {
        // WEB-141: disputes freeze refund actions (refundPayment blocks on
        // "disputed") and are flagged on the payment + project via audit.
        const dispute = event.data.object as Stripe.Dispute;
        const intentId = typeof dispute.payment_intent === "string" ? dispute.payment_intent : null;
        if (!intentId) break;
        const payment = (
          await db
            .select({ id: schema.payments.id, projectId: schema.payments.projectId, organizationId: schema.payments.organizationId })
            .from(schema.payments)
            .where(eq(schema.payments.stripePaymentIntentId, intentId))
            .limit(1)
        )[0];
        if (!payment) break;

        const closed = event.type === "charge.dispute.closed";
        // A won dispute restores the payment; a lost one ends disputed (Stripe
        // has already pulled the funds back — the row stays flagged).
        const nextStatus = closed ? (dispute.status === "lost" ? "dispute_lost" : "succeeded") : "disputed";
        await db.batch([
          db
            .update(schema.payments)
            .set({ status: nextStatus })
            .where(eq(schema.payments.id, payment.id)),
          db.insert(schema.auditLog).values({
            id: crypto.randomUUID(),
            organizationId: payment.organizationId,
            actorType: "system",
            action: closed ? "payment.dispute_closed" : "payment.dispute_opened",
            targetType: payment.projectId ? "project" : "payment",
            targetId: payment.projectId ?? payment.id,
            meta: JSON.stringify({ disputeId: dispute.id, reason: dispute.reason ?? null, outcome: closed ? dispute.status : null, paymentId: payment.id }),
          }),
        ]);
        break;
      }
      case "account.updated": {
        // Connect onboarding state refresh (WEB-154). The panel also
        // live-retrieves on view, so this is a push-based convenience.
        const account = event.data.object as Stripe.Account;
        const organizationId = account.metadata?.organizationId;
        if (organizationId) {
          const { deriveConnectState, saveConnectState } = await import("@/lib/connect");
          await saveConnectState(organizationId, account.id, deriveConnectState(account));
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const { applySubscriptionState } = await import("@/lib/billing");
        await applySubscriptionState(sub);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subRef = (invoice.parent as { subscription?: { subscription?: string } } | undefined)?.subscription?.subscription ?? null;
        console.error("billing: invoice payment failed — customer:", invoice.customer ?? "?", "sub:", subRef ?? "?");
        break;
      }
      case "checkout.session.expired": {
        // WEB-165: abandoned payment — release the slot hold.
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.bookingId && session.metadata?.organizationId) {
          await cancelBooking(session.metadata.organizationId, session.metadata.bookingId, "system");
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error(`stripe webhook handler failed (${event.type}):`, String(err));
    return Response.json({ received: true, processed: false });
  }

  return Response.json({ received: true });
}
