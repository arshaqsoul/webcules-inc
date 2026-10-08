/* WEB-352: the public booking route charges ONLY on the studio's own Stripe account,
 * in the studio's currency, with no platform fee - and refuses (holding nothing) when
 * the studio has no active account. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const { createSession } = vi.hoisted(() => ({
  createSession: vi.fn(async () => ({ id: "cs_test_1", url: "https://checkout.stripe.test/c/cs_test_1" })),
}));
vi.mock("@/lib/stripe", () => ({ getStripe: async () => ({ checkout: { sessions: { create: createSession } } }) }));

import { POST as bookingSubmit } from "@/app/api/embed/bookings/route";
import { getDb, schema } from "@/lib/db";
import { saveConnectState } from "@/lib/connect";
import { computeDateSlots } from "@/lib/repos/availability";
import { createSessionType } from "@/lib/repos/session-types";
import { resetDb } from "../helpers/db";
import { seedAvailability, seedStudio } from "../helpers/seed";

beforeEach(async () => {
  await resetDb();
  createSession.mockClear();
});

function nextTuesdayUtc(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 10);
  d.setUTCDate(d.getUTCDate() + ((2 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

async function setup() {
  const studio = await seedStudio({ plan: "studio" });
  await seedAvailability({ organizationId: studio.organizationId, weekday: 2 });
  const type = await createSessionType(studio.organizationId, { name: "Mini", depositKind: "deposit", depositMinor: 2500 }, null);
  if (!type.ok) throw new Error("seed");
  const { slots } = await computeDateSlots(studio.organizationId, "UTC", nextTuesdayUtc(), type.type.id);
  const submit = () =>
    bookingSubmit(
      new Request(`https://snap.test/api/embed/bookings?key=${studio.embedKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotStart: slots[0].startAt.toISOString(), name: "Maya Patel", email: "maya@example.com", sessionType: "mini", turnstileToken: "" }),
      }),
    );
  return { studio, submit };
}

const bookingCount = async (orgId: string) =>
  (await getDb().select().from(schema.bookings).where(eq(schema.bookings.organizationId, orgId))).length;

describe("booking checkout account (WEB-352)", () => {
  it("refuses with payments_unavailable and holds no slot when the studio is not connected", async () => {
    const { studio, submit } = await setup();
    const res = await submit();
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("payments_unavailable");
    expect(createSession).not.toHaveBeenCalled();
    expect(await bookingCount(studio.organizationId)).toBe(0);
  });

  it("refuses while onboarding is still pending or restricted", async () => {
    const { studio, submit } = await setup();
    for (const state of ["pending", "restricted"] as const) {
      await saveConnectState(studio.organizationId, "acct_studio", state, "cad");
      expect((await submit()).status, state).toBe(409);
    }
    expect(createSession).not.toHaveBeenCalled();
  });

  it("charges directly on the studio account, in the studio currency, with no platform fee", async () => {
    const { studio, submit } = await setup();
    await saveConnectState(studio.organizationId, "acct_studio", "active", "cad");
    const res = await submit();
    expect(res.status).toBe(200);
    expect(((await res.json()) as { checkoutUrl: string }).checkoutUrl).toContain("checkout.stripe.test");

    expect(createSession).toHaveBeenCalledTimes(1);
    const [args, opts] = createSession.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
    expect(opts).toEqual({ stripeAccount: "acct_studio" });
    const item = (args.line_items as Array<{ price_data: { currency: string; unit_amount: number } }>)[0];
    expect(item.price_data.currency).toBe("cad");
    expect(item.price_data.unit_amount).toBe(2500);
    expect(JSON.stringify(args)).not.toMatch(/transfer_data|application_fee|on_behalf_of/);
    expect(await bookingCount(studio.organizationId)).toBe(1);
  });
});
