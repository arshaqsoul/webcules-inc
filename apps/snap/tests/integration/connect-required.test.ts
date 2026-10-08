/* WEB-352: paid bookings need the studio's own Stripe account.
 * - the server refuses to switch payment ON (availability or a deposit session type)
 *   until the studio is connected, but never blocks unrelated saves of a setup that
 *   was already on
 * - the studio's payment currency follows its Stripe account currency */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { resetDb } from "../helpers/db";
import { seedStudio } from "../helpers/seed";

const { ctx } = vi.hoisted(() => ({
  ctx: {
    current: null as { user: { id: string; email: string; name: string; image: null }; organizationId: string; role: string } | null,
  },
}));
vi.mock("@/lib/session", () => ({ getOrgContext: async () => ctx.current }));

import { PUT as putAvailability } from "@/app/api/studio/availability/route";
import { POST as postSessionType } from "@/app/api/studio/session-types/route";
import { getDb, schema } from "@/lib/db";
import { saveConnectState, studioCanTakePayments } from "@/lib/connect";
import { getAvailability } from "@/lib/repos/availability";

let orgId = "";

function avail(payment: { enabled: boolean }) {
  return putAvailability(
    new Request("https://snap.test/api/studio/availability", {
      method: "PUT",
      body: JSON.stringify({ rules: [], settings: { payment: { ...payment, kind: "deposit", amountMinor: 2500 } }, blackouts: [] }),
    }),
  );
}

function sessionType(depositKind: "off" | "deposit" | "full") {
  return postSessionType(
    new Request("https://snap.test/api/studio/session-types", {
      method: "POST",
      body: JSON.stringify({ name: `Type ${depositKind}`, depositKind, depositMinor: depositKind === "off" ? null : 2500 }),
    }),
  );
}

beforeEach(async () => {
  await resetDb();
  const s = await seedStudio({ plan: "studio" });
  orgId = s.organizationId;
  ctx.current = { user: { id: s.userId, email: "o@test.dev", name: "Owner", image: null }, organizationId: orgId, role: "owner" };
});

describe("payment needs a connected Stripe account (WEB-352)", () => {
  it("refuses to switch paid bookings on while unconnected, allows leaving them off", async () => {
    const on = await avail({ enabled: true });
    expect(on.status).toBe(409);
    expect(((await on.json()) as { error: string }).error).toBe("connect_required");
    expect((await getAvailability(orgId)).settings.payment?.enabled ?? false).toBe(false);

    expect((await avail({ enabled: false })).status).toBe(200);
  });

  it("allows switching on once the studio is connected and active", async () => {
    await saveConnectState(orgId, "acct_test", "active", "cad");
    expect(await studioCanTakePayments(orgId)).toBe(true);
    expect((await avail({ enabled: true })).status).toBe(200);
    expect((await getAvailability(orgId)).settings.payment?.enabled).toBe(true);
  });

  it("does not trap a studio that already had payment on: unrelated saves keep working", async () => {
    await saveConnectState(orgId, "acct_test", "active", "usd");
    expect((await avail({ enabled: true })).status).toBe(200);
    await saveConnectState(orgId, "acct_test", "restricted");
    expect(await studioCanTakePayments(orgId)).toBe(false);
    expect((await avail({ enabled: true })).status).toBe(200);
  });

  it("treats pending and restricted accounts as not ready", async () => {
    for (const state of ["pending", "restricted", "not_connected"] as const) {
      await saveConnectState(orgId, "acct_test", state);
      expect(await studioCanTakePayments(orgId), state).toBe(false);
    }
  });

  it("refuses a deposit or full-payment session type while unconnected, allows a free one", async () => {
    for (const kind of ["deposit", "full"] as const) {
      const res = await sessionType(kind);
      expect(res.status, kind).toBe(409);
      expect(((await res.json()) as { error: string }).error).toBe("connect_required");
    }
    expect((await sessionType("off")).status).toBe(200);
  });

  it("allows a deposit session type once connected", async () => {
    await saveConnectState(orgId, "acct_test", "active");
    expect((await sessionType("deposit")).status).toBe(200);
  });
});

describe("studio payment currency (WEB-352)", () => {
  const currencyOf = async () =>
    (await getDb().select({ c: schema.studioProfiles.paymentCurrency }).from(schema.studioProfiles).where(eq(schema.studioProfiles.organizationId, orgId)))[0]!.c;

  it("defaults to usd and follows the Stripe account currency once saved", async () => {
    expect(await currencyOf()).toBe("usd");
    await saveConnectState(orgId, "acct_test", "active", "cad");
    expect(await currencyOf()).toBe("cad");
  });

  it("is left alone when a state refresh carries no currency", async () => {
    await saveConnectState(orgId, "acct_test", "active", "cad");
    await saveConnectState(orgId, "acct_test", "pending");
    expect(await currencyOf()).toBe("cad");
  });
});
