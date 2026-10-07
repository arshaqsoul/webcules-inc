/* WEB-329 - Pro is sales-assigned, never self-serve. The plan route refuses a
 * Pro checkout or proration preview before touching Stripe, while Lite/Studio
 * still reach the billing layer. */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetDb } from "../helpers/db";
import { seedStudio } from "../helpers/seed";

const { ctx, createPlanCheckout, previewPlanChange } = vi.hoisted(() => ({
  ctx: {
    current: null as { user: { id: string; email: string; name: string; image: null }; organizationId: string; role: string } | null,
  },
  createPlanCheckout: vi.fn(async () => ({ url: "https://stripe.test/checkout", mode: "checkout", message: undefined })),
  previewPlanChange: vi.fn(async () => ({ ok: true, netMinor: 500 })),
}));
vi.mock("@/lib/session", () => ({ getOrgContext: async () => ctx.current }));
vi.mock("@/lib/billing", async (orig) => ({
  ...(await orig<typeof import("@/lib/billing")>()),
  createPlanCheckout,
  previewPlanChange,
}));

import { POST } from "@/app/api/studio/plan/route";

function post(body: unknown) {
  return POST(new Request("https://snap.test/api/studio/plan", { method: "POST", body: JSON.stringify(body) }));
}

beforeEach(async () => {
  await resetDb();
  createPlanCheckout.mockClear();
  previewPlanChange.mockClear();
  const s = await seedStudio({ plan: "free" });
  ctx.current = { user: { id: s.userId, email: "o@test.dev", name: "Owner", image: null }, organizationId: s.organizationId, role: "owner" };
});

describe("POST /api/studio/plan - Pro is not self-serve (WEB-329)", () => {
  it("refuses a Pro checkout with contact_sales and never calls billing", async () => {
    const res = await post({ plan: "pro" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("contact_sales");
    expect(createPlanCheckout).not.toHaveBeenCalled();
  });

  it("refuses a Pro proration preview", async () => {
    const res = await post({ preview: "pro" });
    expect(res.status).toBe(400);
    expect(previewPlanChange).not.toHaveBeenCalled();
  });

  it("still checks out Lite and Studio", async () => {
    for (const plan of ["lite", "studio"]) {
      const res = await post({ plan });
      expect(res.status).toBe(200);
    }
    expect(createPlanCheckout).toHaveBeenCalledTimes(2);
  });
});
