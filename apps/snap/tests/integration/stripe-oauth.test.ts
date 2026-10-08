/* WEB-352: connect an existing Stripe account via OAuth - the callback only completes for the
 * studio that started it, never takes an account id from the URL, never steals an account that
 * belongs to another studio, and a revoked connection is forgotten. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const { ctx, stripe } = vi.hoisted(() => ({
  ctx: {
    current: null as { user: { id: string; email: string; name: string; image: null }; organizationId: string; role: string } | null,
  },
  stripe: {
    oauth: { token: vi.fn() },
    accounts: { retrieve: vi.fn() },
  },
}));
vi.mock("@/lib/session", () => ({ getOrgContext: async () => ctx.current }));
vi.mock("@/lib/stripe", () => ({ getStripe: async () => stripe }));

import { GET as callback } from "@/app/api/studio/payouts/oauth/callback/route";
import { GET as start } from "@/app/api/studio/payouts/oauth/start/route";
import { getDb, schema } from "@/lib/db";
import { disconnectStudioAccount, saveConnectState } from "@/lib/connect";
import { signOAuthState } from "@/lib/stripe-oauth";
import { resetDb } from "../helpers/db";
import { seedStudio } from "../helpers/seed";

const SECRET = "test-secret-test-secret-test-secret-0123456789";
let orgId = "";

const profile = async (id = orgId) =>
  (await getDb().select().from(schema.studioProfiles).where(eq(schema.studioProfiles.organizationId, id)))[0]!;

const activeAccount = (id: string, currency = "cad") => ({
  id,
  default_currency: currency,
  details_submitted: true,
  charges_enabled: true,
  payouts_enabled: true,
  requirements: { past_due: [], currently_due: [], pending_verification: [], disabled_reason: null },
});

async function cb(params: Record<string, string>) {
  const q = new URLSearchParams(params);
  return callback(new Request(`https://snap.test/api/studio/payouts/oauth/callback?${q.toString()}`));
}
const result = (res: Response) => new URL(res.headers.get("location")!).searchParams.get("oauth");

beforeEach(async () => {
  await resetDb();
  stripe.oauth.token.mockReset();
  stripe.accounts.retrieve.mockReset();
  const s = await seedStudio({ plan: "studio" });
  orgId = s.organizationId;
  ctx.current = { user: { id: s.userId, email: "o@test.dev", name: "Owner", image: null }, organizationId: orgId, role: "owner" };
});

describe("OAuth start (WEB-352)", () => {
  it("redirects to Stripe with a signed state and the registered callback", async () => {
    const res = await start(new Request("https://snap.test/api/studio/payouts/oauth/start"));
    expect(res.status).toBe(302);
    const url = new URL(res.headers.get("location")!);
    expect(url.origin).toBe("https://connect.stripe.com");
    expect(url.searchParams.get("client_id")).toBe("ca_test_client");
    expect(url.searchParams.get("redirect_uri")).toContain("/api/studio/payouts/oauth/callback");
    expect(url.searchParams.get("state")!.startsWith(orgId)).toBe(true);
  });

  it("refuses when the studio already has an account", async () => {
    await saveConnectState(orgId, "acct_existing", "active");
    const res = await start(new Request("https://snap.test/api/studio/payouts/oauth/start"));
    expect(res.status).toBe(409);
  });
});

describe("OAuth callback (WEB-352)", () => {
  it("connects the account Stripe returns and saves its state and currency", async () => {
    stripe.oauth.token.mockResolvedValue({ stripe_user_id: "acct_mine" });
    stripe.accounts.retrieve.mockResolvedValue(activeAccount("acct_mine", "cad"));
    const state = await signOAuthState(SECRET, orgId);
    const res = await cb({ code: "ac_123", state });
    expect(result(res)).toBe("connected");
    expect(stripe.oauth.token).toHaveBeenCalledWith({ grant_type: "authorization_code", code: "ac_123" });
    const p = await profile();
    expect(p.stripeAccountId).toBe("acct_mine");
    expect(p.stripeConnectState).toBe("active");
    expect(p.paymentCurrency).toBe("cad");
    const audit = await getDb().select().from(schema.auditLog).where(eq(schema.auditLog.action, "connect.account_linked"));
    expect(audit).toHaveLength(1);
  });

  it("never takes an account id from the URL", async () => {
    stripe.oauth.token.mockResolvedValue({ stripe_user_id: "acct_from_stripe" });
    stripe.accounts.retrieve.mockResolvedValue(activeAccount("acct_from_stripe"));
    const state = await signOAuthState(SECRET, orgId);
    await cb({ code: "ac_1", state, stripe_user_id: "acct_evil", account: "acct_evil" });
    expect((await profile()).stripeAccountId).toBe("acct_from_stripe");
  });

  it("rejects a missing, forged or other studio's state without calling Stripe", async () => {
    const other = await seedStudio({ plan: "studio" });
    const foreign = await signOAuthState(SECRET, other.organizationId);
    for (const state of [undefined, "garbage", foreign]) {
      const res = await cb({ code: "ac_1", ...(state ? { state } : {}) });
      expect(result(res)).toBe("invalid_state");
    }
    expect(stripe.oauth.token).not.toHaveBeenCalled();
    expect((await profile()).stripeAccountId).toBeNull();
  });

  it("reports a denied connection and changes nothing", async () => {
    const res = await cb({ error: "access_denied", state: await signOAuthState(SECRET, orgId) });
    expect(result(res)).toBe("denied");
    expect(stripe.oauth.token).not.toHaveBeenCalled();
  });

  it("will not replace an account the studio already has", async () => {
    await saveConnectState(orgId, "acct_existing", "active");
    const res = await cb({ code: "ac_1", state: await signOAuthState(SECRET, orgId) });
    expect(result(res)).toBe("already_connected");
    expect(stripe.oauth.token).not.toHaveBeenCalled();
    expect((await profile()).stripeAccountId).toBe("acct_existing");
  });

  it("will not take an account that belongs to another studio", async () => {
    const other = await seedStudio({ plan: "studio" });
    await saveConnectState(other.organizationId, "acct_shared", "active");
    stripe.oauth.token.mockResolvedValue({ stripe_user_id: "acct_shared" });
    const res = await cb({ code: "ac_1", state: await signOAuthState(SECRET, orgId) });
    expect(result(res)).toBe("account_in_use");
    expect((await profile()).stripeAccountId).toBeNull();
    expect((await profile(other.organizationId)).stripeAccountId).toBe("acct_shared");
  });

  it("survives a failed token exchange", async () => {
    stripe.oauth.token.mockRejectedValue(new Error("invalid_grant"));
    const res = await cb({ code: "ac_bad", state: await signOAuthState(SECRET, orgId) });
    expect(result(res)).toBe("failed");
    expect((await profile()).stripeAccountId).toBeNull();
  });
});

describe("revoked connection (WEB-352)", () => {
  it("forgets the account so no payment is attempted on it, and audits it", async () => {
    await saveConnectState(orgId, "acct_mine", "active", "cad");
    await disconnectStudioAccount("acct_mine");
    const p = await profile();
    expect(p.stripeAccountId).toBeNull();
    expect(p.stripeConnectState).toBe("not_connected");
    const audit = await getDb().select().from(schema.auditLog).where(eq(schema.auditLog.action, "connect.account_deauthorized"));
    expect(audit).toHaveLength(1);
  });

  it("is a no-op for an account we don't know", async () => {
    await expect(disconnectStudioAccount("acct_unknown")).resolves.toBeUndefined();
  });
});
