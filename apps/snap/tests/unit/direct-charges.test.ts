/* WEB-352: client money is charged DIRECTLY on the studio's own Stripe account.
 * The studio's Stripe pays the Stripe fee; Snap's platform account never pays a
 * fee and never receives client money. Spike WEB-351 measured the old destination
 * charge costing the platform 4.00 on a 100.00 payment. */
import { describe, expect, it } from "vitest";

import { STUDIO_ACCOUNT_CONTROLLER, chargeAccountId, onAccount, studioAccountParams } from "@/lib/connect";

describe("studio account creation (WEB-352)", () => {
  it("uses controller settings: full dashboard, studio pays fees, Stripe holds losses", () => {
    expect(STUDIO_ACCOUNT_CONTROLLER).toEqual({
      stripe_dashboard: { type: "full" },
      fees: { payer: "account" },
      losses: { payments: "stripe" },
      requirement_collection: "stripe",
    });
  });

  it("never sends the legacy express type (direct charges are rejected on it)", () => {
    const params = studioAccountParams({ organizationId: "org_1", studioName: "Lumen", contactEmail: "a@b.co" });
    expect("type" in params).toBe(false);
    expect(params.controller).toBe(STUDIO_ACCOUNT_CONTROLLER);
    expect(params.capabilities).toEqual({ card_payments: { requested: true }, transfers: { requested: true } });
    expect(params.metadata).toMatchObject({ organizationId: "org_1" });
  });
});

describe("charge account resolution (WEB-352)", () => {
  it("returns the account only when the studio is active", () => {
    expect(chargeAccountId({ stripeAccountId: "acct_1", stripeConnectState: "active" })).toBe("acct_1");
  });

  it("refuses every other state - there is no platform fallback", () => {
    for (const state of ["pending", "restricted", "not_connected", null]) {
      expect(chargeAccountId({ stripeAccountId: "acct_1", stripeConnectState: state })).toBeNull();
    }
    expect(chargeAccountId({ stripeAccountId: null, stripeConnectState: "active" })).toBeNull();
    expect(chargeAccountId(null)).toBeNull();
    expect(chargeAccountId(undefined)).toBeNull();
  });

  it("runs Stripe calls on the studio account via the Stripe-Account header", () => {
    expect(onAccount("acct_9")).toEqual({ stripeAccount: "acct_9" });
  });
});

describe("source guard: Snap never takes a cut or routes client money through the platform", () => {
  const sources = import.meta.glob(["/app/**/*.{ts,tsx}", "/lib/**/*.{ts,tsx}"], {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;

  it("scans real source files", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50);
  });

  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("has no destination charges (transfer_data) and no application fees in code", () => {
    const offenders: string[] = [];
    for (const [path, raw] of Object.entries(sources)) {
      if (path.includes("/docs/content/")) continue;
      const code = stripComments(raw);
      if (/transfer_data|application_fee|on_behalf_of/.test(code)) offenders.push(path);
    }
    expect(offenders).toEqual([]);
  });

  it("never falls back to the platform account for booking or invoice payments", () => {
    for (const [path, raw] of Object.entries(sources)) {
      if (/embed\/bookings\/route|reschedule\/route|lib\/invoices/.test(path)) {
        expect(stripComments(raw), path).not.toMatch(/falling back to platform/i);
        expect(stripComments(raw), path).not.toMatch(/payment_intent_data:\s*undefined/);
      }
    }
  });
});
