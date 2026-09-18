import Stripe from "stripe";

let cached: Stripe | null = null;

/** Returns the Stripe client, or null when Stripe isn't configured (manual/e-Transfer mode). */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!cached) cached = new Stripe(key);
  return cached;
}

export function stripeEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4400";
}
