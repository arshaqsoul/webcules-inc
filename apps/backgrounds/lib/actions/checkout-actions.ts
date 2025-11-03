"use server";
import {
  BackgroundCollection,
  BackgroundMedia,
  User,
} from "@webcules/payload/payload-types";
import Stripe from "stripe";

const stripe = new Stripe(`${process.env.STRIPE_SECRET_KEY}`);

const SUBSCRIPTION_PRICE_ID = process.env.STRIPE_SUBSCRIPTION_PRICE_ID;

export async function createStripeCheckoutSession(
  type: "backgroundCollection" | "backgroundImage" | "subscription",
  item: BackgroundCollection | BackgroundMedia | undefined,
  user: User
): Promise<{ url: string | null; error: string | null }> {
  if (!user || !process.env.NEXT_PUBLIC_APP_URL) {
    return {
      url: null,
      error: "Missing user or site URL environment variable",
    };
  }

  const protocol =
    process.env.NODE_ENV === "development" ? "http://" : "https://";
  const successUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?checkout=success`;
  const cancelUrl = `${process.env.NEXT_PUBLIC_APP_URL}/checkout/${type}`;

  let sessionConfig: Stripe.Checkout.SessionCreateParams;
  let metadata: Record<string, string | number> = {
    userId: user.id,
    type: type,
  };

  try {
    switch (type) {
      case "subscription":
        if (!SUBSCRIPTION_PRICE_ID) {
          throw new Error("Stripe subscription price ID is not configured.");
        }
        metadata = { ...metadata, plan: "basic" };
        sessionConfig = {
          mode: "subscription",
          line_items: [{ price: SUBSCRIPTION_PRICE_ID, quantity: 1 }],
          subscription_data: {
            // Optional: for trials, you can add: trial_period_days: 7,
          },
        };
        break;

      case "backgroundCollection":
        if (!item || !("collectionPrice" in item)) {
          throw new Error("Invalid BackgroundCollection item");
        }
        metadata = {
          ...metadata,
          itemId: item.id,
          price: item.collectionPrice.toFixed(2),
        };
        sessionConfig = {
          mode: "payment",
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: `Collection: ${(item as BackgroundCollection).title}`,
                },
                unit_amount: Math.round(item.collectionPrice * 100),
              },
              quantity: 1,
            },
          ],
        };
        break;

      case "backgroundImage":
        if (!item || !("singleImagePrice" in item)) {
          throw new Error("Invalid BackgroundMedia item");
        }
        metadata = {
          ...metadata,
          itemId: item.id,
          price: (item.singleImagePrice || 0).toFixed(2),
        };
        sessionConfig = {
          mode: "payment",
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: `Image: ${(item as BackgroundMedia).filename}`,
                },
                unit_amount: Math.round((item.singleImagePrice || 0) * 100),
              },
              quantity: 1,
            },
          ],
        };
        break;

      default:
        return { url: null, error: "Unsupported payment type" };
    }

    // Common configuration for all sessions
    const session = await stripe.checkout.sessions.create({
      ...sessionConfig,
      customer_email: user.email, // Pre-fill email
      metadata: metadata,
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true, // Allow coupons/promo codes
      // Optional: If you collect customer info elsewhere
      // payment_intent_data: {
      //   metadata: metadata,
      // },
      // subscription_data: {
      //   metadata: metadata,
      // },
    });

    return { url: session.url, error: null };
  } catch (error) {
    console.error("Error creating Checkout Session:", error);
    return { url: null, error: "Failed to create checkout session." };
  }
}
