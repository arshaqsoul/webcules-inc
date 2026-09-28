/* createStudioForUser — honest plan writes (free default, validated input),
 * unique slugs, embed keys. */
import { beforeEach, describe, expect, it } from "vitest";

import { getStudioProfile } from "@/lib/repos/studios";
import { createStudioForUser } from "@/lib/repos/studios";
import { resetDb } from "../helpers/db";
import { seedUser, seedStudio } from "../helpers/seed";

beforeEach(async () => {
  await resetDb();
});

describe("createStudioForUser", () => {
  it("defaults to the free plan and writes it explicitly", async () => {
    const s = await createStudioForUser({ userId: await seedUser(), studioName: "Fresh Signup", timezone: "UTC" });
    expect(s.plan).toBe("free");
    const profile = await getStudioProfile(s.organizationId);
    expect(profile?.plan).toBe("free");
    expect(profile?.embedKey).toBe(s.embedKey);
  });

  it("accepts valid paid plans, rejects unknown plan strings to free", async () => {
    const paid = await createStudioForUser({ userId: await seedUser(), studioName: "Paid", timezone: "UTC", plan: "lite" });
    expect(paid.plan).toBe("lite");
    const junk = await createStudioForUser({ userId: await seedUser(), studioName: "Junk", timezone: "UTC", plan: "enterprise" });
    expect(junk.plan).toBe("free");
  });

  it("slugifies names and uniques on collision", async () => {
    const s1 = await createStudioForUser({ userId: await seedUser(), studioName: "Priya Weddings", timezone: "UTC" });
    const s2 = await createStudioForUser({ userId: await seedUser(), studioName: "Priya Weddings", timezone: "UTC" });
    expect(s1.slug).not.toBe(s2.slug);
    expect(s1.slug).toMatch(/^priya-weddings/);
  });
});

describe("seeded studios behave (harness check)", () => {
  it("seedStudio writes readable profiles", async () => {
    const s = await seedStudio({ name: "Harness", plan: "lite" });
    const profile = await getStudioProfile(s.organizationId);
    expect(profile?.studioName).toBe("Harness");
    expect(profile?.plan).toBe("lite");
  });
});
