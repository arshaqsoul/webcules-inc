/* ensureCustomer — a stored Stripe customer id is verified, never trusted:
 * ids from another Stripe account (or deleted customers) are replaced, but a
 * transient Stripe error must NOT mint a duplicate customer. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { resetDb } from "../helpers/db";
import { seedStudio } from "../helpers/seed";

const stripeMock = {
  customers: {
    retrieve: vi.fn(),
    create: vi.fn(),
  },
};
vi.mock("@/lib/stripe", () => ({ getStripe: async () => stripeMock }));

import { ensureCustomer } from "@/lib/billing";

async function profileOf(organizationId: string) {
  return (
    await getDb().select().from(schema.studioProfiles).where(eq(schema.studioProfiles.organizationId, organizationId))
  )[0];
}

async function seedWithCustomer(customerId: string | null, subscriptionId: string | null = null) {
  const s = await seedStudio({ plan: "lite" });
  await getDb()
    .update(schema.studioProfiles)
    .set({ stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId })
    .where(eq(schema.studioProfiles.organizationId, s.organizationId));
  return s;
}

beforeEach(async () => {
  await resetDb();
  stripeMock.customers.retrieve.mockReset();
  stripeMock.customers.create.mockReset();
});

describe("ensureCustomer", () => {
  it("no stored id: creates a customer and stores it", async () => {
    const s = await seedWithCustomer(null);
    stripeMock.customers.create.mockResolvedValue({ id: "cus_new" });
    expect(await ensureCustomer(s.organizationId)).toBe("cus_new");
    expect(stripeMock.customers.retrieve).not.toHaveBeenCalled();
    expect((await profileOf(s.organizationId)).stripeCustomerId).toBe("cus_new");
  });

  it("stored id that exists on Stripe is reused", async () => {
    const s = await seedWithCustomer("cus_ok");
    stripeMock.customers.retrieve.mockResolvedValue({ id: "cus_ok" });
    expect(await ensureCustomer(s.organizationId)).toBe("cus_ok");
    expect(stripeMock.customers.create).not.toHaveBeenCalled();
  });

  it("stored id from another Stripe account (resource_missing) is replaced and the dead subscription link cleared", async () => {
    const s = await seedWithCustomer("cus_old_account", "sub_old_account");
    stripeMock.customers.retrieve.mockRejectedValue(Object.assign(new Error("No such customer"), { code: "resource_missing", statusCode: 404 }));
    stripeMock.customers.create.mockResolvedValue({ id: "cus_fresh" });
    expect(await ensureCustomer(s.organizationId)).toBe("cus_fresh");
    const p = await profileOf(s.organizationId);
    expect(p.stripeCustomerId).toBe("cus_fresh");
    expect(p.stripeSubscriptionId).toBeNull();
  });

  it("a deleted customer is replaced", async () => {
    const s = await seedWithCustomer("cus_deleted");
    stripeMock.customers.retrieve.mockResolvedValue({ id: "cus_deleted", deleted: true });
    stripeMock.customers.create.mockResolvedValue({ id: "cus_fresh2" });
    expect(await ensureCustomer(s.organizationId)).toBe("cus_fresh2");
  });

  it("a transient Stripe error keeps the stored id and creates nothing", async () => {
    const s = await seedWithCustomer("cus_keep", "sub_keep");
    stripeMock.customers.retrieve.mockRejectedValue(Object.assign(new Error("socket hang up"), { statusCode: 500 }));
    expect(await ensureCustomer(s.organizationId)).toBe("cus_keep");
    expect(stripeMock.customers.create).not.toHaveBeenCalled();
    const p = await profileOf(s.organizationId);
    expect(p.stripeCustomerId).toBe("cus_keep");
    expect(p.stripeSubscriptionId).toBe("sub_keep");
  });
});
