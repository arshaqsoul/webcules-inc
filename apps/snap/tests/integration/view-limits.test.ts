/* Gallery view rate limiting (WEB-160): per-IP window + monthly budget.
 * WEB-443: grid-thumb exemption + batched per-page view-counter writes. */
import { beforeEach, describe, expect, it } from "vitest";

import { getDb, schema } from "@/lib/db";
import {
  GALLERY_MONTHLY_VIEW_BUDGET,
  IP_VIEWS_PER_MIN,
  checkImageView,
  countGalleryAssetViews,
  countGalleryOpen,
  viewLimiterApplies,
} from "@/lib/limits";
import { createShareGrant } from "@/lib/shares/grants";
import { resetDb } from "../helpers/db";
import { seedAsset, seedProject, seedStudio } from "../helpers/seed";

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

/* ---------------- WEB-443 ---------------- */

describe("viewLimiterApplies (WEB-443 thumb exemption)", () => {
  it("exempts grid thumbs — a full gallery grid never trips the per-IP cap", () => {
    expect(viewLimiterApplies("thumb", false)).toBe(false);
    // A bare GET serves the original bytes — still limited.
    expect(viewLimiterApplies(null, false)).toBe(true);
  });

  it("still limits full-size serves and every download", () => {
    expect(viewLimiterApplies("preview", false)).toBe(true);
    expect(viewLimiterApplies("preview_wm", false)).toBe(true);
    // A thumb WITH download=1 is a deliberate byte fetch, not a grid tile.
    expect(viewLimiterApplies("thumb", true)).toBe(true);
    expect(viewLimiterApplies(null, true)).toBe(true);
  });
});

describe("countGalleryAssetViews (WEB-443 batched writes)", () => {
  async function seedGrant() {
    const s = await seedStudio();
    const p = await seedProject(s.organizationId);
    const ids = [
      await seedAsset({ organizationId: s.organizationId, projectId: p, kind: "image", filename: "a.jpg", status: "approved" }),
      await seedAsset({ organizationId: s.organizationId, projectId: p, kind: "image", filename: "b.jpg", status: "approved" }),
    ];
    const grant = await createShareGrant({
      organizationId: s.organizationId, projectId: p, clientEmail: "client@t.test",
      assetIds: ids, expiresAt: null, createdById: s.userId,
    });
    expect(grant.ok).toBe(true);
    return { s, assetIds: ids, grantId: grant.ok ? grant.grantId : "" };
  }

  it("counts one view per delivered asset per call (single aggregate statement)", async () => {
    const g = await seedGrant();
    await countGalleryAssetViews(g.s.organizationId, g.grantId);
    await countGalleryAssetViews(g.s.organizationId, g.grantId);

    const rows = await getDb().select().from(schema.assetViewMonthly);
    expect(rows).toHaveLength(2); // one row per asset (upsert, not append)
    expect(rows.every((r) => r.views === 2 && r.grantId === g.grantId)).toBe(true);
  });

  it("never counts assets outside the grant's delivered set", async () => {
    const g = await seedGrant();
    const otherProject = await seedProject(g.s.organizationId);
    const outsider = await seedAsset({
      organizationId: g.s.organizationId,
      projectId: otherProject,
      kind: "image", filename: "other.jpg", status: "approved",
    });
    await countGalleryAssetViews(g.s.organizationId, g.grantId);
    const rows = await getDb().select().from(schema.assetViewMonthly);
    expect(rows.map((r) => r.assetId)).not.toContain(outsider);
    expect(rows).toHaveLength(2);
  });
});
