/* The seam between the commerce core and whatever app embeds it.
 * The core imports nothing from a host; a host hands in an implementation of this interface.
 * Snap is the first host. Anything the core needs from the outside world must be added here. */
import type { Currency } from "./money";
import type { PlanCommerceGates } from "./catalog";

/** The slice of D1 the core uses. Structurally satisfied by Cloudflare's D1Database. */
export interface CommerceDb {
  prepare(sql: string): CommerceStatement;
  batch<T = unknown>(statements: CommerceStatement[]): Promise<Array<{ results?: T[]; success: boolean }>>;
}

export interface CommerceStatement {
  bind(...values: unknown[]): CommerceStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
}

export type HostOrganization = {
  id: string;
  gates: PlanCommerceGates;
  /** Stripe account the studio is paid on. Null until connected. */
  stripeAccountId: string | null;
  defaultCurrency: Currency;
};

export type CheckoutLine = { name: string; unitAmountMinor: number; quantity: number };

/** Direct-charge Checkout input. There is deliberately no application-fee field: commerce is 0% commission. */
export type DirectChargeCheckoutInput = {
  stripeAccountId: string;
  currency: Currency;
  lines: CheckoutLine[];
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
  metadata: Record<string, string>;
};

export type EmailMessage = { to: string; subject: string; html: string; replyTo?: string };

export interface CommerceHost {
  db: CommerceDb;
  now(): Date;
  newId(): string;
  organizations: {
    get(organizationId: string): Promise<HostOrganization | null>;
  };
  storage: {
    /** Time-limited URL for a delivered file. */
    signedUrl(key: string, ttlSeconds: number): Promise<string>;
  };
  email: {
    send(message: EmailMessage): Promise<void>;
  };
  payments: {
    createCheckoutSession(input: DirectChargeCheckoutInput): Promise<{ id: string; url: string }>;
  };
}
