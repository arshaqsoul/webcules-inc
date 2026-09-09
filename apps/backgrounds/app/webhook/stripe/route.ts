import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getPayload } from "payload";
import config from "@webcules/payload/payload.config";

// Use the fetch HTTP client - Node's http client does not work on Cloudflare Workers
const stripe = new Stripe(`${process.env.STRIPE_SECRET_KEY!}`, {
  httpClient: Stripe.createFetchHttpClient(),
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

/**
 * Map Stripe subscription status to our subscription status
 */
function mapSubscriptionStatus(
  stripeStatus: string
): "active" | "canceled" | "incomplete" | "none" {
  switch (stripeStatus) {
    case "active":
      return "active";
    case "canceled":
      return "canceled";
    case "incomplete":
      return "incomplete";
    default:
      return "none";
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const sig = req.headers.get("stripe-signature")!;

    let event: Stripe.Event;

    try {
      // constructEventAsync uses Web Crypto - supported on Cloudflare Workers
      event = await stripe.webhooks.constructEventAsync(body, sig, endpointSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const payload = await getPayload({ config });

    // Handle the event
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        console.log("Checkout session completed:", session.id);

        // Get metadata from the session
        const metadata = session.metadata;
        if (!metadata) {
          console.error("No metadata found in session:", session.id);
          return NextResponse.json({ error: "No metadata" }, { status: 400 });
        }

        const userId = metadata.userId;
        const purchaseType = metadata.type; // "backgroundCollection", "backgroundImage", or "subscription"

        if (!userId || !purchaseType) {
          console.error("Missing required metadata:", { userId, purchaseType });
          return NextResponse.json(
            { error: "Missing metadata" },
            { status: 400 }
          );
        }

        try {
          // Update user with Stripe customer ID if not already set
          if (session.customer && typeof session.customer === "string") {
            await payload.update({
              collection: "users",
              id: parseInt(userId, 10),
              data: {
                stripeCustomerID: session.customer,
              },
            });
          }

          if (purchaseType === "subscription") {
            // Handle subscription purchase - set user as paid (all access)
            if (
              session.subscription &&
              typeof session.subscription === "string"
            ) {
              const subscription = await stripe.subscriptions.retrieve(
                session.subscription
              );

              // Map Stripe status to our subscription status
              const mappedStatus = mapSubscriptionStatus(subscription.status);

              await payload.update({
                collection: "users",
                id: parseInt(userId, 10),
                data: {
                  isPaid: true,
                  subscriptionStatus: mappedStatus,
                  stripeCustomerID: session.customer as string,
                },
              });

              console.log(
                `Updated user ${userId} subscription status to ${mappedStatus}, isPaid: true`
              );
            }
          } else {
            // Handle one-time purchases (backgroundCollection or backgroundImage)
            // Note: Do NOT set isPaid to true for one-time purchases
            // isPaid is only for all-access subscribers
            const itemId = metadata.itemId;
            const price = parseFloat(metadata.price || "0");

            if (!itemId) {
              console.error("Missing itemId for one-time purchase");
              return NextResponse.json(
                { error: "Missing itemId" },
                { status: 400 }
              );
            }

            // Create purchase record
            const purchaseData = {
              user: parseInt(userId, 10), // Convert string ID to number if needed
              itemType: (purchaseType === "backgroundCollection"
                ? "collection"
                : "media") as "collection" | "media",
              item: {
                relationTo: (purchaseType === "backgroundCollection"
                  ? "backgroundCollections"
                  : "backgroundMedia") as
                  | "backgroundCollections"
                  | "backgroundMedia",
                value: parseInt(itemId, 10),
              },
              price: price,
              transactionID: session.id,
            };

            const purchase = await payload.create({
              collection: "purchases",
              data: purchaseData,
            });

            console.log(
              `Created purchase record: ${purchase.id} for user ${userId}`
            );
            console.log(
              `User ${userId} purchased ${purchaseType} ${itemId} - isPaid remains false (not a subscriber)`
            );
          }
        } catch (error) {
          console.error("Error processing checkout session:", error);
          return NextResponse.json(
            { error: "Processing failed" },
            { status: 500 }
          );
        }

        break;
      }

      case "invoice.payment_succeeded": {
        // Handle recurring subscription payments
        const invoice = event.data.object as Stripe.Invoice;

        if ((invoice as any).subscription && invoice.customer) {
          const subscription = await stripe.subscriptions.retrieve(
            (invoice as any).subscription as string
          );

          // Find user by Stripe customer ID
          const users = await payload.find({
            collection: "users",
            where: {
              stripeCustomerID: { equals: invoice.customer as string },
            },
          });

          if (users.totalDocs > 0) {
            const user = users.docs[0];
            if (user) {
              await payload.update({
                collection: "users",
                id: user.id,
                data: {
                  subscriptionStatus: mapSubscriptionStatus(
                    subscription.status
                  ),
                  isPaid: true, // Ensure they remain marked as paid
                },
              });

              console.log(
                `Updated user ${user.id} subscription status to ${mapSubscriptionStatus(subscription.status)}, isPaid: true`
              );
            }
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        // Handle subscription updates (including scheduled cancellations)
        const subscription = event.data.object as Stripe.Subscription;

        // Find user by Stripe customer ID
        const users = await payload.find({
          collection: "users",
          where: {
            stripeCustomerID: { equals: subscription.customer as string },
          },
        });

        if (users.totalDocs > 0) {
          const user = users.docs[0];
          if (user) {
            // If subscription is scheduled for cancellation, mark as incomplete
            const newStatus = subscription.cancel_at_period_end
              ? "incomplete"
              : mapSubscriptionStatus(subscription.status);

            await payload.update({
              collection: "users",
              id: user.id,
              data: {
                subscriptionStatus: newStatus,
              },
            });

            console.log(
              `Updated user ${user.id} subscription status to ${newStatus}, isPaid: ${subscription.cancel_at_period_end ? false : true}`
            );
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        // Handle subscription cancellations (when actually deleted)
        const subscription = event.data.object as Stripe.Subscription;

        // Find user by Stripe customer ID
        const users = await payload.find({
          collection: "users",
          where: {
            stripeCustomerID: { equals: subscription.customer as string },
          },
        });

        if (users.totalDocs > 0) {
          const user = users.docs[0];
          if (user) {
            await payload.update({
              collection: "users",
              id: user.id,
              data: {
                subscriptionStatus: "canceled",
                isPaid: false, // Remove all-access when subscription is finally canceled
              },
            });

            console.log(
              `Updated user ${user.id} subscription status to canceled, isPaid: false`
            );
          }
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}
