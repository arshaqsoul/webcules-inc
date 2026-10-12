/* WEB-277 (Commerce C1 6/7) — preview sessions can never create a real
 * order. The flag is a server-minted signed cookie (lib/store-preview.ts);
 * cart creation, cart adds, and Stripe checkout sessions all refuse preview
 * sessions BEFORE any write or Stripe call. */
import { beforeEach, describe, expect, it } from "vitest";

import { getDb, schema } from "@/lib/db";
import { addCartItem, getOrCreateCart } from "@/lib/repos/carts";
import { createCheckoutSession } from "@/lib/repos/checkout";
import { signStorePreviewToken, storePreviewActive, STORE_PREVIEW_COOKIE } from "@/lib/store-preview";
import { resetDb } from "../helpers/db";
import { seedProject, seedStudio } from "../helpers/seed";

beforeEach(async () => {
  await resetDb();
});

const SECRET = "test-secret";

describe("preview token", () => {
  it("round-trips for the issuing org only", async () => {
    const org = "0d0c0b0a-0000-4000-8000-000000000001";
    const token = await signStorePreviewToken(org, SECRET);
    expect(token.startsWith(`${org}.`)).toBe(true);

    const header = `${STORE_PREVIEW_COOKIE}=${token}`;
    expect(await storePreviewActive(header, org, SECRET)).toBe(true);
    // Another org (or another secret) must not verify.
    expect(await storePreviewActive(header, "0d0c0b0a-0000-4000-8000-000000000002", SECRET)).toBe(false);
    expect(await storePreviewActive(header, org, "other-secret")).toBe(false);
  });

  it("rejects tampered values and absent cookies", async () => {
    const org = "0d0c0b0a-0000-4000-8000-000000000003";
    const token = await signStorePreviewToken(org, SECRET);
    const flipped = token.slice(0, -2) + (token.endsWith("00") ? "11" : "00");
    expect(await storePreviewActive(`${STORE_PREVIEW_COOKIE}=${flipped}`, org, SECRET)).toBe(false);
    expect(await storePreviewActive(null, org, SECRET)).toBe(false);
    expect(await storePreviewActive("other=1", org, SECRET)).toBe(false);
  });
});

describe("preview refusals (order paths)", () => {
  it("getOrCreateCart refuses and writes nothing", async () => {
    const s = await seedStudio({ plan: "studio" });
    const projectId = await seedProject(s.organizationId);
    const grant = (
      await getDb()
        .insert(schema.shareGrants)
        .values({
          id: crypto.randomUUID(),
          organizationId: s.organizationId,
          projectId,
          clientEmail: "c@t.test",
          tokenHash: `th-${crypto.randomUUID()}`,
          status: "active",
          expiresAt: null,
        })
        .returning()
    )[0];

    const res = await getOrCreateCart({
      organizationId: s.organizationId,
      grantId: grant.id,
      visitorId: "visitor-1",
      currency: "USD",
      preview: true,
    });
    expect(res).toEqual({ ok: false, error: "preview_refused" });
    expect(await getDb().select().from(schema.carts)).toHaveLength(0);
  });

  it("addCartItem refuses and writes nothing", async () => {
    const s = await seedStudio({ plan: "studio" });
    const add = await addCartItem({
      organizationId: s.organizationId,
      grantId: "g",
      visitorId: "v",
      variantId: "v1",
      name: "8×10 print",
      unitPriceCents: 1800,
      quantity: 1,
      currency: "USD",
      preview: true,
    });
    expect(add).toEqual({ ok: false, error: "preview_refused" });
    expect(await getDb().select().from(schema.carts)).toHaveLength(0);
    expect(await getDb().select().from(schema.cartItems)).toHaveLength(0);
  });

  it("createCheckoutSession refuses before Stripe is ever called", async () => {
    const s = await seedStudio({ plan: "studio" });
    let stripeCalls = 0;
    const fakeStripe = {
      checkout: {
        sessions: {
          create: async () => {
            stripeCalls += 1;
            throw new Error("must not be called in preview");
          },
        },
      },
    };
    const res = await createCheckoutSession({
      organizationId: s.organizationId,
      cartId: "does-not-matter",
      galleryUrl: "https://g.example/x",
      stripe: fakeStripe,
      preview: true,
    });
    expect(res).toEqual({ ok: false, error: "preview_refused" });
    expect(stripeCalls).toBe(0);
    expect(await getDb().select().from(schema.checkoutSessions)).toHaveLength(0);
  });

  it("non-preview sessions keep working (the flag is the only change)", async () => {
    const s = await seedStudio({ plan: "studio" });
    const projectId = await seedProject(s.organizationId);
    const grant = (
      await getDb()
        .insert(schema.shareGrants)
        .values({
          id: crypto.randomUUID(),
          organizationId: s.organizationId,
          projectId,
          clientEmail: "c@t.test",
          tokenHash: `th-${crypto.randomUUID()}`,
          status: "active",
          expiresAt: null,
        })
        .returning()
    )[0];
    const res = await getOrCreateCart({
      organizationId: s.organizationId,
      grantId: grant.id,
      visitorId: "visitor-2",
      currency: "USD",
    });
    expect(res.ok).toBe(true);
    expect(await getDb().select().from(schema.carts)).toHaveLength(1);
  });
});
