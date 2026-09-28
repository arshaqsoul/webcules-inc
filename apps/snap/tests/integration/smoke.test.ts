/* Smoke: the harness itself — app code (getDb via cloudflare:workers) must
 * see the same D1 the test env seeds, and migrations must have applied. */
import { expect, test } from "vitest";

import { seedStudio } from "../helpers/seed";

test("app db path reads the test D1 bindings", async () => {
  const studio = await seedStudio({ name: "Smoke Studio" });
  expect(studio.organizationId).toBeTruthy();
  expect(studio.plan).toBe("free");

  // Read back through the app's own query path (repos/studios).
  const { getStudioProfile } = await import("@/lib/repos/studios");
  const profile = await getStudioProfile(studio.organizationId);
  expect(profile?.studioName).toBe("Smoke Studio");
  expect(profile?.plan).toBe("free");
});
