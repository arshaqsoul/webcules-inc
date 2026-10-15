/* WEB-441 regression: groupSizes — the Files-feed group_cover facet query
 * that failed in prod ("Failed query: select \"group_cover\", count(*) …").
 * Exercises the exact query shape Drizzle renders: select group_cover +
 * count(*), filtered by org + project + group_cover IS NOT NULL, grouped by
 * group_cover — plus mixed cover states (some grouped, some not) and tenant
 * isolation. */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { inArray } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { groupSizes, safeFacet } from "@/lib/repos/assets";
import { resetDb } from "../helpers/db";
import { seedAsset, seedProject, seedStudio } from "../helpers/seed";

async function setGroupCover(ids: string[], cover: string) {
  if (ids.length === 0) return;
  await getDb()
    .update(schema.assets)
    .set({ groupCover: cover })
    .where(inArray(schema.assets.id, ids));
}

beforeEach(async () => {
  await resetDb();
});

describe("groupSizes (WEB-441)", () => {
  it("returns cover → member count for a project with mixed cover states", async () => {
    const studio = await seedStudio({ name: "A" });
    const project = await seedProject(studio.organizationId);

    // Cluster 1: cover + 2 members. Cluster 2: cover only so far.
    const cover1 = await seedAsset({ organizationId: studio.organizationId, projectId: project });
    const m1a = await seedAsset({ organizationId: studio.organizationId, projectId: project });
    const m1b = await seedAsset({ organizationId: studio.organizationId, projectId: project });
    const cover2 = await seedAsset({ organizationId: studio.organizationId, projectId: project });
    // Ungrouped assets in the same project — must not appear in the map.
    await seedAsset({ organizationId: studio.organizationId, projectId: project });
    await seedAsset({ organizationId: studio.organizationId, projectId: project });

    await setGroupCover([cover1, m1a, m1b], cover1);
    await setGroupCover([cover2], cover2);

    const groups = await groupSizes(studio.organizationId, project);
    expect(groups).toEqual({ [cover1]: 3, [cover2]: 1 });
  });

  it("does not leak group sizes across tenants", async () => {
    const a = await seedStudio({ name: "A" });
    const b = await seedStudio({ name: "B" });
    const pa = await seedProject(a.organizationId);
    const pb = await seedProject(b.organizationId);

    const cover = await seedAsset({ organizationId: b.organizationId, projectId: pb });
    const member = await seedAsset({ organizationId: b.organizationId, projectId: pb });
    await setGroupCover([cover, member], cover);

    expect(await groupSizes(a.organizationId, pa)).toEqual({});
    expect(await groupSizes(b.organizationId, pb)).toEqual({ [cover]: 2 });
  });

  it("empty project yields an empty map without error", async () => {
    const studio = await seedStudio({ name: "A" });
    const project = await seedProject(studio.organizationId);
    expect(await groupSizes(studio.organizationId, project)).toEqual({});
  });

  it("safeFacet returns the fallback (not a rejection) when the facet query fails", async () => {
    const boom = () => Promise.reject(new Error("Failed query: select \"group_cover\", count(*) …"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(safeFacet("group-cover-sizes", boom, {})).resolves.toEqual({});
      expect(errSpy).toHaveBeenCalledTimes(1);
      expect(String(errSpy.mock.calls[0][0])).toContain("group-cover-sizes");

      // and the healthy path passes through untouched
      const studio = await seedStudio({ name: "A" });
      const project = await seedProject(studio.organizationId);
      const cover = await seedAsset({ organizationId: studio.organizationId, projectId: project });
      const member = await seedAsset({ organizationId: studio.organizationId, projectId: project });
      await setGroupCover([cover, member], cover);
      await expect(safeFacet("group-cover-sizes", () => groupSizes(studio.organizationId, project), {})).resolves.toEqual({ [cover]: 2 });
    } finally {
      errSpy.mockRestore();
    }
  });
});
