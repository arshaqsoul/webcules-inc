/* WEB-445 — entitlement counters: the asset triggers (migrations/0083)
 * maintain usage_counters on every insert/delete path (these tests insert
 * directly, the way seed/demo/import paths do), getPlanEntitlements reads
 * them, and resync/parity keep them honest against the live ledger. */
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { getPlanEntitlements, usageMonthKey, USAGE_TOTAL_MONTH } from "@/lib/plans";
import { deleteAsset } from "@/lib/repos/assets";
import { resyncUsageCounters, usageCounterParity } from "@/lib/repos/usage-counters";
import { resetDb } from "../helpers/db";
import { seedAsset, seedProject, seedStudio } from "../helpers/seed";

const MB = 1024 ** 2;

beforeEach(async () => {
  await resetDb();
});

describe("usage_counters triggers (WEB-445)", () => {
  it("direct asset inserts maintain the lifetime counters exactly", async () => {
    const s = await seedStudio({ plan: "free" });
    const project = await seedProject(s.organizationId);
    await seedAsset({ organizationId: s.organizationId, projectId: project, kind: "image", bytes: 2 * MB });
    await seedAsset({ organizationId: s.organizationId, projectId: project, kind: "raw", bytes: 1 * MB });
    await seedAsset({ organizationId: s.organizationId, projectId: project, kind: "video", bytes: 3 * MB });

    const db = getDb();
    const total = (
      await db
        .select()
        .from(schema.usageCounters)
        .where(and(eq(schema.usageCounters.organizationId, s.organizationId), eq(schema.usageCounters.month, USAGE_TOTAL_MONTH)))
    )[0];
    expect(total?.storedBytes).toBe(6 * MB);
    expect(total?.fileCount).toBe(3);
    expect(total?.rawBytes).toBe(1 * MB);

    const ent = await getPlanEntitlements(s.organizationId);
    expect(ent?.storageUsedBytes).toBe(6 * MB);
    expect(ent?.fileCount).toBe(3);
    expect(ent?.rawBytesUsed).toBe(1 * MB);
    expect(ent?.monthUploadBytes).toBe(6 * MB); // all created this month
  });

  it("deletes decrement the counters, including the creation-month upload row", async () => {
    const s = await seedStudio({ plan: "free" });
    const project = await seedProject(s.organizationId);
    const keep = await seedAsset({ organizationId: s.organizationId, projectId: project, kind: "image", bytes: 5 * MB });
    const gone = await seedAsset({ organizationId: s.organizationId, projectId: project, kind: "raw", bytes: 2 * MB });

    const ok = await deleteAsset(s.organizationId, gone);
    expect(ok).toEqual({ ok: true });

    const ent = await getPlanEntitlements(s.organizationId);
    expect(ent?.storageUsedBytes).toBe(5 * MB);
    expect(ent?.fileCount).toBe(1);
    expect(ent?.rawBytesUsed).toBe(0);
    expect(ent?.monthUploadBytes).toBe(5 * MB); // the RAW's budget refunded

    // Deleting the last asset returns the org to a clean zero.
    await deleteAsset(s.organizationId, keep);
    const zero = await getPlanEntitlements(s.organizationId);
    expect(zero?.storageUsedBytes).toBe(0);
    expect(zero?.fileCount).toBe(0);
    expect(zero?.monthUploadBytes).toBe(0);
  });

  it("project cascade deletes keep the counters exact", async () => {
    const s = await seedStudio({ plan: "free" });
    const project = await seedProject(s.organizationId);
    await seedAsset({ organizationId: s.organizationId, projectId: project, bytes: 4 * MB });
    await seedAsset({ organizationId: s.organizationId, projectId: project, bytes: 1 * MB });

    // Project row delete cascades asset rows (FK) — the AFTER DELETE trigger
    // must fire for the cascaded deletes too.
    await getDb().delete(schema.projects).where(eq(schema.projects.id, project));
    expect(await usageCounterParity()).toEqual([]);

    const ent = await getPlanEntitlements(s.organizationId);
    expect(ent?.storageUsedBytes).toBe(0);
    expect(ent?.fileCount).toBe(0);
  });

  it("usage pools across a studio family via per-org counter rows", async () => {
    const parent = await seedStudio({ plan: "lite" });
    const child = await seedStudio({ plan: "lite" });
    const db = getDb();
    await db
      .update(schema.organization)
      .set({ parentOrganizationId: parent.organizationId })
      .where(eq(schema.organization.id, child.organizationId));
    const parentProject = await seedProject(parent.organizationId);
    const childProject = await seedProject(child.organizationId);
    await seedAsset({ organizationId: parent.organizationId, projectId: parentProject, bytes: 10 * MB });
    await seedAsset({ organizationId: child.organizationId, projectId: childProject, bytes: 4 * MB });

    const ent = await getPlanEntitlements(child.organizationId);
    expect(ent?.storageUsedBytes).toBe(14 * MB);
    expect(ent?.fileCount).toBe(2);
    expect(ent?.rootOrganizationId).toBe(parent.organizationId);
  });

  it("parity detects hand-corrupted counters; resync heals them", async () => {
    const s = await seedStudio({ plan: "free" });
    const project = await seedProject(s.organizationId);
    await seedAsset({ organizationId: s.organizationId, projectId: project, bytes: 7 * MB });
    expect(await usageCounterParity()).toEqual([]);

    const db = getDb();
    await db
      .update(schema.usageCounters)
      .set({ storedBytes: 999 })
      .where(and(eq(schema.usageCounters.organizationId, s.organizationId), eq(schema.usageCounters.month, USAGE_TOTAL_MONTH)));

    const drift = await usageCounterParity();
    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatchObject({ organizationId: s.organizationId, field: "stored_bytes", counter: 999, live: 7 * MB });

    await resyncUsageCounters();
    expect(await usageCounterParity()).toEqual([]);
    const ent = await getPlanEntitlements(s.organizationId);
    expect(ent?.storageUsedBytes).toBe(7 * MB);
  });

  it("usageMonthKey matches the trigger's strftime month key", async () => {
    // The read side must slice the same UTC 'YYYY-MM' the triggers compute.
    expect(usageMonthKey()).toMatch(/^\d{4}-\d{2}$/);
    const s = await seedStudio({ plan: "free" });
    const project = await seedProject(s.organizationId);
    await seedAsset({ organizationId: s.organizationId, projectId: project, bytes: 1 * MB });
    const rows = await getDb()
      .select({ month: schema.usageCounters.month, uploadBytes: schema.usageCounters.uploadBytes })
      .from(schema.usageCounters)
      .where(eq(schema.usageCounters.organizationId, s.organizationId));
    const monthly = rows.find((r) => r.month === usageMonthKey());
    expect(monthly?.uploadBytes).toBe(1 * MB);
  });
});
