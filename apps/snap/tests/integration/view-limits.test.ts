/* Gallery view rate limiting (WEB-160): per-IP window + monthly budget. */
import { beforeEach, describe, expect, it } from "vitest";

import { schema } from "@/lib/db";
import { GALLERY_MONTHLY_VIEW_BUDGET, IP_VIEWS_PER_MIN, checkImageView, countGalleryOpen } from "@/lib/limits";
import { resetDb } from "../helpers/db";
import { seedStudio } from "../helpers/seed";

beforeEach(async () => {
  await resetDb();
});

describe("checkImageView", () => {
  it("allows views under the per-IP window", async () => {
    const s = await seedStudio();
    for (let i = 0; i < IP_VIEWS_PER_MIN; i++) {
      expect(await checkImageView("1.2.3.4", s.organizationId, "grant-1")).toEqual({ ok: true });
    }
  });

  it("refuses with reason=ip once the window is exceeded", async () => {
    const s = await seedStudio();
    for (let i = 0; i < IP_VIEWS_PER_MIN; i++) await checkImageView("5.6.7.8", s.organizationId, "grant-1");
    const over = await checkImageView("5.6.7.8", s.organizationId, "grant-1");
    expect(over).toMatchObject({ ok: false, reason: "ip" });
    // A different IP in the same window is unaffected.
    expect(await checkImageView("9.9.9.9", s.organizationId, "grant-1")).toEqual({ ok: true });
  });

  it("refuses with reason=budget when the monthly grant budget is exhausted", async () => {
    const s = await seedStudio();
    // Seed the counter directly at the cap (5M real increments would be slow);
    // the next view must trip the budget clause.
    const month = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
    const db = (await import("@/lib/db")).getDb();
    await db.insert(schema.galleryViewMonthly).values({
      organizationId: s.organizationId, grantId: "grant-budget", month, views: GALLERY_MONTHLY_VIEW_BUDGET,
    });
    const over = await checkImageView("10.1.1.1", s.organizationId, "grant-budget");
    expect(over).toMatchObject({ ok: false, reason: "budget" });
  });
});

describe("countGalleryOpen", () => {
  it("increments the monthly counter and stays under budget", async () => {
    const s = await seedStudio();
    expect(await countGalleryOpen(s.organizationId, "grant-open")).toBe(true);
    expect(await countGalleryOpen(s.organizationId, "grant-open")).toBe(true);
  });
});
