/* WEB-352: the OAuth "connect an existing Stripe account" state token and URLs. The state
 * is the CSRF / account-mix-up defense, so it must be bound to the studio, expire, and be
 * tamper-proof. */
import { describe, expect, it } from "vitest";

import { OAUTH_STATE_TTL_MS, oauthAuthorizeUrl, oauthRedirectUri, signOAuthState, verifyOAuthState } from "@/lib/stripe-oauth";

const SECRET = "test-secret-test-secret-test-secret-0123456789";
const ORG = "0e1fdf44-e464-4f7a-8b45-0c92e20d33b3";

describe("oauth state (WEB-352)", () => {
  it("verifies for the studio that started it", async () => {
    const state = await signOAuthState(SECRET, ORG);
    expect(await verifyOAuthState(SECRET, state, ORG)).toBe(true);
  });

  it("is bound to the studio: another org cannot complete it", async () => {
    const state = await signOAuthState(SECRET, ORG);
    expect(await verifyOAuthState(SECRET, state, "11111111-2222-3333-4444-555555555555")).toBe(false);
  });

  it("expires", async () => {
    const t0 = 1_800_000_000_000;
    const state = await signOAuthState(SECRET, ORG, t0);
    expect(await verifyOAuthState(SECRET, state, ORG, t0 + OAUTH_STATE_TTL_MS - 1)).toBe(true);
    expect(await verifyOAuthState(SECRET, state, ORG, t0 + OAUTH_STATE_TTL_MS + 1)).toBe(false);
  });

  it("rejects tampering, a different secret, and junk", async () => {
    const state = await signOAuthState(SECRET, ORG);
    const [org, nonce, exp, sig] = state.split(".");
    expect(await verifyOAuthState(SECRET, `${org}.${nonce}.${Number(exp) + 999999}.${sig}`, ORG)).toBe(false);
    expect(await verifyOAuthState(SECRET, `${org}.${nonce}.${exp}.${sig.slice(0, -2)}AA`, ORG)).toBe(false);
    expect(await verifyOAuthState("another-secret-another-secret-0000000000", state, ORG)).toBe(false);
    for (const junk of [null, undefined, "", "a.b.c", "x".repeat(400), `${org}.${nonce}.${exp}`]) {
      expect(await verifyOAuthState(SECRET, junk as string | null, ORG), String(junk).slice(0, 20)).toBe(false);
    }
  });

  it("uses a fresh nonce each time", async () => {
    expect(await signOAuthState(SECRET, ORG)).not.toBe(await signOAuthState(SECRET, ORG));
  });
});

describe("oauth URLs (WEB-352)", () => {
  it("builds the Stripe authorize URL", () => {
    const url = new URL(oauthAuthorizeUrl({ clientId: "ca_123", redirectUri: "https://snaphq.app/cb", state: "s", email: "a@b.co", businessName: "Lumen" }));
    expect(url.origin + url.pathname).toBe("https://connect.stripe.com/oauth/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("ca_123");
    expect(url.searchParams.get("scope")).toBe("read_write");
    expect(url.searchParams.get("state")).toBe("s");
    expect(url.searchParams.get("stripe_user[email]")).toBe("a@b.co");
  });

  it("builds the redirect URI from the app origin", () => {
    expect(oauthRedirectUri("https://snaphq.app/")).toBe("https://snaphq.app/api/studio/payouts/oauth/callback");
  });
});
