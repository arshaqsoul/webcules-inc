/* checkUploadGate — the free-tier type rules (video paid, RAW inside the
 * trial pocket) and every byte bound. */
import { beforeEach, describe, expect, it } from "vitest";

import { checkUploadGate } from "@/lib/uploads";
import { resetDb } from "../helpers/db";
import { seedAsset, seedProject, seedStudio } from "../helpers/seed";

const GB = 1024 ** 3;

beforeEach(async () => {
  await resetDb();
});

describe("checkUploadGate on Free", () => {
  it("accepts JPGs and RAW inside the 3 GB pocket", async () => {
    const s = await seedStudio({ plan: "free" });
    expect(await checkUploadGate(s.organizationId, "photo.jpg", 5 * 1024 ** 2)).toEqual({ ok: true });
    expect(await checkUploadGate(s.organizationId, "keeper.nef", 1 * GB)).toEqual({ ok: true });
  });

  it("rejects video on Free", async () => {
    const s = await seedStudio({ plan: "free" });
    const res = await checkUploadGate(s.organizationId, "clip.mp4", 5 * 1024 ** 2);
    expect(res).toMatchObject({ ok: false, error: "plan_type_restricted", status: 403 });
  });

  it("rejects RAW beyond the pocket and reports the budget", async () => {
    const s = await seedStudio({ plan: "free" });
    const project = await seedProject(s.organizationId);
    await seedAsset({ organizationId: s.organizationId, projectId: project, kind: "raw", bytes: 2 * GB });

    // 0.9 GB more fits (2 + 0.9 <= 3); 1.1 GB does not.
    expect(await checkUploadGate(s.organizationId, "more.nef", Math.floor(0.9 * GB))).toEqual({ ok: true });
    const res = await checkUploadGate(s.organizationId, "toomuch.nef", Math.floor(1.1 * GB));
    expect(res).toMatchObject({ ok: false, error: "plan_type_restricted" });
    if (!res.ok) {
      expect(res.extra?.kind).toBe("raw");
      expect(res.extra?.rawTrialBytes).toBe(3 * GB);
      expect(res.extra?.rawBytesUsed).toBe(2 * GB);
    }
  });

  it("rejects unknown extensions at session creation (createUploadSession)", async () => {
    const s = await seedStudio({ plan: "pro" });
    const project = await seedProject(s.organizationId);
    const { createUploadSession } = await import("@/lib/uploads");
    expect(
      await createUploadSession({
        organizationId: s.organizationId, projectId: project, uploadedBy: s.userId,
        filename: "app.zip", mimeType: "application/zip", bytes: 1000,
      }),
    ).toMatchObject({ ok: false, error: "unsupported_type" });
    // A small JPG mints a session with a locally-presigned PUT (no network).
    const ok = await createUploadSession({
      organizationId: s.organizationId, projectId: project, uploadedBy: s.userId,
      filename: "fine.jpg", mimeType: "image/jpeg", bytes: 1000,
    });
    expect(ok.ok).toBe(true);
  });
});

describe("checkUploadGate on paid tiers", () => {
  it("Lite/Studio accept RAW and video without a pocket", async () => {
    for (const plan of ["lite", "studio", "pro"]) {
      const s = await seedStudio({ plan });
      expect(await checkUploadGate(s.organizationId, "keeper.raf", 50 * GB)).toEqual({ ok: true });
      expect(await checkUploadGate(s.organizationId, "clip.mov", 5 * GB)).toEqual({ ok: true });
    }
  });
});

describe("byte bounds (all tiers)", () => {
  it("hard lock: storage + upload must stay under 2x cap", async () => {
    const s = await seedStudio({ plan: "free" }); // 20GB cap, 40GB lock
    const project = await seedProject(s.organizationId);
    await seedAsset({ organizationId: s.organizationId, projectId: project, bytes: 15 * GB });
    // 15 + 26 = 41 GB > 40 GB lock → refused; 15 + 24 = 39 GB fits.
    expect(await checkUploadGate(s.organizationId, "big.jpg", 26 * GB)).toMatchObject({
      ok: false,
      error: "storage_locked",
      status: 413,
    });
    expect(await checkUploadGate(s.organizationId, "big.jpg", 24 * GB)).toEqual({ ok: true });
  });

  // NOTE upload_rate_bound is defense-in-depth today, not a reachable branch:
  // monthUploadBytes is a live sum over assets created this month, which is a
  // subset of storageUsedBytes — so storage_locked (checked first, same 2x
  // bound) always trips before the monthly bound can. If WEB-161's
  // usage_counters ever feed the gate (counting deleted bytes as churn),
  // add a test here that churn-without-storage trips 429.
});
