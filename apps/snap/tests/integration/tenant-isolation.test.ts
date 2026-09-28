/* Tenant isolation probes (repo level — WEB-139): studio A must never touch
 * studio B's data through any repository API. */
import { beforeEach, describe, expect, it } from "vitest";

import { getDb, schema } from "@/lib/db";
import { deleteAsset, getAsset } from "@/lib/repos/assets";
import { listProjects } from "@/lib/repos/projects";
import { getStudioProfile } from "@/lib/repos/studios";
import { createShareGrant, getShareGrant } from "@/lib/shares/grants";
import { resetDb } from "../helpers/db";
import { seedAsset, seedProject, seedStudio } from "../helpers/seed";

beforeEach(async () => {
  await resetDb();
});

describe("cross-tenant probes", () => {
  it("getAsset is org-scoped: B cannot read A's asset by id", async () => {
    const a = await seedStudio({ name: "A" });
    const b = await seedStudio({ name: "B" });
    const project = await seedProject(a.organizationId);
    const asset = await seedAsset({ organizationId: a.organizationId, projectId: project });

    expect(await getAsset(a.organizationId, asset)).not.toBeNull();
    expect(await getAsset(b.organizationId, asset)).toBeUndefined();
  });

  it("deleteAsset is org-scoped: B's delete of A's asset is a not_found, not a deletion", async () => {
    const a = await seedStudio({ name: "A" });
    const b = await seedStudio({ name: "B" });
    const project = await seedProject(a.organizationId);
    const asset = await seedAsset({ organizationId: a.organizationId, projectId: project });

    expect(await deleteAsset(b.organizationId, asset)).toMatchObject({ ok: false, error: "not_found" });
    expect(await getAsset(a.organizationId, asset)).not.toBeNull();
  });

  it("share grants only resolve within their org", async () => {
    const a = await seedStudio({ name: "A" });
    const b = await seedStudio({ name: "B" });
    const project = await seedProject(a.organizationId);
    const asset = await seedAsset({ organizationId: a.organizationId, projectId: project });
    const res = await createShareGrant({
      organizationId: a.organizationId, projectId: project, clientEmail: "c@t.test",
      assetIds: [asset], expiresAt: null, createdById: a.userId,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(await getShareGrant(a.organizationId, res.grantId)).not.toBeNull();
    expect(await getShareGrant(b.organizationId, res.grantId)).toBeNull();
  });

  it("project listings never leak across orgs", async () => {
    const a = await seedStudio({ name: "A" });
    const b = await seedStudio({ name: "B" });
    await seedProject(a.organizationId, "A's project");
    await seedProject(b.organizationId, "B's project");

    const aProjects = await listProjects(a.organizationId);
    const bProjects = await listProjects(b.organizationId);
    expect(aProjects.map((p) => p.title)).toEqual(["A's project"]);
    expect(bProjects.map((p) => p.title)).toEqual(["B's project"]);
  });

  it("studio profiles never leak across orgs", async () => {
    const a = await seedStudio({ name: "Alpha" });
    const b = await seedStudio({ name: "Beta" });
    expect((await getStudioProfile(a.organizationId))?.studioName).toBe("Alpha");
    expect(await getStudioProfile("nonexistent-org")).toBeNull();
    expect((await getStudioProfile(b.organizationId))?.studioName).toBe("Beta");
  });

  it("storage keys embed the org prefix (R2 path traversal base)", async () => {
    const a = await seedStudio({ name: "A" });
    const project = await seedProject(a.organizationId);
    const asset = await seedAsset({ organizationId: a.organizationId, projectId: project, filename: "x.jpg" });
    const row = await getAsset(a.organizationId, asset);
    expect(row?.storageKey.startsWith(`${a.organizationId}/`)).toBe(true);
  });
});
