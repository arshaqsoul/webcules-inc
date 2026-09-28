/* getPlanEntitlements — live usage vs caps: storage/raw sums, the free RAW
 * pocket fields, expiry-aware gallery counting, active-booking counting. */
import { beforeEach, describe, expect, it } from "vitest";

import { getDb, schema } from "@/lib/db";
import { getPlanEntitlements } from "@/lib/plans";
import { resetDb } from "../helpers/db";
import { seedAsset, seedProject, seedStudio } from "../helpers/seed";

const GB = 1024 ** 3;

beforeEach(async () => {
  await resetDb();
});

describe("getPlanEntitlements", () => {
  it("empty free studio: zeroed usage, pocket configured", async () => {
    const s = await seedStudio({ plan: "free" });
    const ent = await getPlanEntitlements(s.organizationId);
    expect(ent?.id).toBe("free");
    expect(ent?.storageUsedBytes).toBe(0);
    expect(ent?.rawBytesUsed).toBe(0);
    expect(ent?.rawTrialBytes).toBe(3 * GB);
    expect(ent?.maxActiveBookings).toBeNull();
    expect(ent?.activeGalleries).toBe(0);
  });

  it("sums storage across kinds and RAW separately", async () => {
    const s = await seedStudio({ plan: "free" });
    const project = await seedProject(s.organizationId);
    await seedAsset({ organizationId: s.organizationId, projectId: project, kind: "image", bytes: 2 * GB });
    await seedAsset({ organizationId: s.organizationId, projectId: project, kind: "raw", bytes: 1 * GB });
    await seedAsset({ organizationId: s.organizationId, projectId: project, kind: "image", bytes: 500 * 1024 ** 2 });

    const ent = await getPlanEntitlements(s.organizationId);
    expect(ent?.storageUsedBytes).toBe(2 * GB + 1 * GB + 500 * 1024 ** 2);
    expect(ent?.rawBytesUsed).toBe(1 * GB);
    expect(ent?.fileCount).toBe(3);
  });

  it("counts only live grants as active galleries (WEB-215 expiry fix)", async () => {
    const s = await seedStudio({ plan: "free" });
    const project = await seedProject(s.organizationId);
    const db = getDb();
    const mkGrant = async (id: string, expiresAt: Date | null, status = "active") => {
      await db.insert(schema.shareGrants).values({
        id, organizationId: s.organizationId, projectId: project, clientEmail: "c@t.test",
        tokenHash: `hash-${id}`, status, expiresAt,
      });
    };
    await mkGrant("never", null); // never expires → counts
    await mkGrant("future", new Date(Date.now() + 30 * 86400_000)); // counts
    await mkGrant("past", new Date(Date.now() - 86400_000)); // lapsed → must NOT count
    await mkGrant("revoked", null, "revoked"); // revoked → must NOT count

    const ent = await getPlanEntitlements(s.organizationId);
    expect(ent?.activeGalleries).toBe(2);
    expect(ent?.maxActiveGalleries).toBe(5);
  });

  it("counts pending + confirmed bookings as active", async () => {
    const s = await seedStudio({ plan: "free" });
    const db = getDb();
    const mk = async (id: string, status: string, hourOffset: number) => {
      await db.insert(schema.bookings).values({
        id, organizationId: s.organizationId, projectId: null,
        startAt: new Date(Date.now() + (hourOffset + 24) * 3600_000),
        endAt: new Date(Date.now() + (hourOffset + 25) * 3600_000),
        timezone: "UTC", clientEmail: "c@t.test", status,
      });
    };
    // Distinct start times — the partial unique index (0004) is org+start.
    await mk("b1", "pending", 0);
    await mk("b2", "confirmed", 3);
    await mk("b3", "canceled", 6);
    const ent = await getPlanEntitlements(s.organizationId);
    expect(ent?.activeBookings).toBe(2);
    expect(ent?.maxActiveBookings).toBeNull(); // the wall is gone
  });

  it("overage zone and hard-lock flags derive from usage", async () => {
    const s = await seedStudio({ plan: "free" }); // 20GB cap, 40GB lock
    const project = await seedProject(s.organizationId);
    await seedAsset({ organizationId: s.organizationId, projectId: project, bytes: 21 * GB });
    let ent = await getPlanEntitlements(s.organizationId);
    expect(ent?.inOverageZone).toBe(true);
    expect(ent?.atHardLock).toBe(false);

    await seedAsset({ organizationId: s.organizationId, projectId: project, bytes: 20 * GB });
    ent = await getPlanEntitlements(s.organizationId);
    expect(ent?.atHardLock).toBe(true);
  });
});
