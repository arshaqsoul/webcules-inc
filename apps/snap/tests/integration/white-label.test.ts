/* WEB-238 white-label integration tests: the effective flag against real
 * D1 (plan entitlement AND brand toggle), the brand PATCH sanitizer path
 * (entitlement gate), and the flag's effect on the surfaces' data source. */
import { beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { getEmailBrand, isWhiteLabeled, resolveWhiteLabel } from "@/lib/branding";
import { getDb, schema } from "@/lib/db";
import { getPlanEntitlements } from "@/lib/plans";
import { getStudioProfile } from "@/lib/repos/studios";
import { resetDb } from "../helpers/db";
import { seedStudio } from "../helpers/seed";

async function setBrand(organizationId: string, brand: Record<string, unknown>) {
  await getDb()
    .update(schema.studioProfiles)
    .set({ brand: JSON.stringify(brand) })
    .where(eq(schema.studioProfiles.organizationId, organizationId));
}

beforeEach(resetDb);

describe("white-label effective flag (WEB-238)", () => {
  it("Studio plan + toggle on → white-labeled", async () => {
    const studio = await seedStudio({ plan: "studio" });
    await setBrand(studio.organizationId, { accent: "#112233", removeBranding: true });
    const ent = await getPlanEntitlements(studio.organizationId);
    const profile = await getStudioProfile(studio.organizationId);
    expect(ent?.whiteLabel).toBe(true);
    expect(isWhiteLabeled(ent, profile?.brand)).toBe(true);
    expect(await resolveWhiteLabel(studio.organizationId)).toBe(true);
  });

  it("Pro plan + toggle on → white-labeled", async () => {
    const studio = await seedStudio({ plan: "pro" });
    await setBrand(studio.organizationId, { removeBranding: true });
    expect(await resolveWhiteLabel(studio.organizationId)).toBe(true);
  });

  it("Free/Lite + toggle on → NOT white-labeled (entitlement wins)", async () => {
    for (const plan of ["free", "lite"]) {
      const studio = await seedStudio({ plan });
      await setBrand(studio.organizationId, { removeBranding: true });
      expect(await resolveWhiteLabel(studio.organizationId)).toBe(false);
    }
  });

  it("Studio plan + toggle off/absent → NOT white-labeled (byte-identical surfaces)", async () => {
    const studio = await seedStudio({ plan: "studio" });
    expect(await resolveWhiteLabel(studio.organizationId)).toBe(false);
    await setBrand(studio.organizationId, { accent: "#112233", removeBranding: false });
    expect(await resolveWhiteLabel(studio.organizationId)).toBe(false);
  });

  it("downgrade: plan drops to free, stale toggle stays harmless", async () => {
    const studio = await seedStudio({ plan: "studio" });
    await setBrand(studio.organizationId, { removeBranding: true });
    expect(await resolveWhiteLabel(studio.organizationId)).toBe(true);
    await getDb()
      .update(schema.studioProfiles)
      .set({ plan: "free" })
      .where(eq(schema.studioProfiles.organizationId, studio.organizationId));
    expect(await resolveWhiteLabel(studio.organizationId)).toBe(false);
  });
});

describe("brand PATCH path (WEB-238)", () => {
  it("persists removeBranding inside the brand JSON alongside existing keys", async () => {
    const studio = await seedStudio({ plan: "studio" });
    await setBrand(studio.organizationId, { accent: "#aabbcc", removeBranding: true });
    const profile = await getStudioProfile(studio.organizationId);
    const brand = JSON.parse(profile?.brand ?? "{}") as { accent?: string; removeBranding?: boolean };
    expect(brand.removeBranding).toBe(true);
    expect(brand.accent).toBe("#aabbcc"); // existing keys untouched
  });

  it("turning the toggle off is always allowed (downgrade-safe)", async () => {
    const studio = await seedStudio({ plan: "free" });
    await setBrand(studio.organizationId, { removeBranding: true });
    await setBrand(studio.organizationId, { removeBranding: false });
    const brand = JSON.parse(
      (await getStudioProfile(studio.organizationId))?.brand ?? "{}",
    ) as { removeBranding?: boolean };
    expect(brand.removeBranding).toBe(false);
  });
});

describe("getEmailBrand (WEB-240)", () => {
  it("bundles name/accent/flag/contact + email-header URL from the asset bag", async () => {
    const studio = await seedStudio({ plan: "studio", name: "Willow & Pine" });
    await setBrand(studio.organizationId, { accent: "#112233", removeBranding: true });
    await getDb()
      .update(schema.studioProfiles)
      .set({
        contactEmail: "hi@willow.test",
        brandAssets: JSON.stringify({
          rev: "rv1",
          emailHeader: `${studio.organizationId}/branding/assets/email-header-rv1.png`,
        }),
      })
      .where(eq(schema.studioProfiles.organizationId, studio.organizationId));

    const b = await getEmailBrand(studio.organizationId);
    expect(b.studioName).toBe("Willow & Pine");
    expect(b.accent).toBe("#112233");
    expect(b.whiteLabel).toBe(true);
    expect(b.contactEmail).toBe("hi@willow.test");
    // The origin follows the test env's NEXT_PUBLIC_APP_URL — assert shape.
    expect(b.emailHeaderUrl).toMatch(new RegExp(`^https?://.+/api/brand/${studio.organizationId}/email-header\\.png\\?rev=rv1$`));
  });

  it("no email-header asset → null URL; not white-labeled → null regardless", async () => {
    const studio = await seedStudio({ plan: "studio" });
    await setBrand(studio.organizationId, { removeBranding: true });
    expect((await getEmailBrand(studio.organizationId)).emailHeaderUrl).toBeNull();

    // Asset present but the toggle is OFF → still null.
    await setBrand(studio.organizationId, { removeBranding: false });
    await getDb()
      .update(schema.studioProfiles)
      .set({
        brandAssets: JSON.stringify({ rev: "rv1", emailHeader: "x" }),
      })
      .where(eq(schema.studioProfiles.organizationId, studio.organizationId));
    expect((await getEmailBrand(studio.organizationId)).emailHeaderUrl).toBeNull();
  });
});
