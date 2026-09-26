/* Stripe on Workers — fetch HTTP client (no Node SDK server), constructed
 * per-call from the secret. Webhooks verify with Web Crypto. */
import Stripe from "stripe";

export async function getStripe(): Promise<Stripe | null> {
  const { env } = await import("cloudflare:workers");
  if (!env.STRIPE_SECRET_KEY) return null;
  return new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-08-27.basil" as Stripe.LatestApiVersion,
    httpClient: Stripe.createFetchHttpClient(),
  });
}
