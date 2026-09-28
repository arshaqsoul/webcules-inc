/* Folders (WEB-216): CRUD + name uniqueness, move semantics (pointer moves
 * only — storage keys untouched), folder-scoped feed filtering, folder-level
 * delivery expansion, and the delivery-time folder_name snapshot that keeps
 * live galleries immune to post-delivery reorgs. Plus tenant isolation. */
import { beforeEach, describe, expect, it } from "vitest";

import { and, eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { listAssetsPaged } from "@/lib/repos/assets";
import {
  cleanFolderName,
  createFolder,
  deleteFolder,
  listFolders,
  moveAssets,
  renameFolder,
} from "@/lib/repos/folders";
import {
  createShareGrant,
  getGrantAssets,
  regenerateShareGrant,
  resolveGrantByToken,
} from "@/lib/shares/grants";
import { resetDb } from "../helpers/db";
import { seedAsset, seedProject, seedStudio } from "../helpers/seed";

beforeEach(async () => {
  await resetDb();
});

describe("cleanFolderName", () => {
  it("trims, strips control chars, caps length, rejects blank", () => {
    expect(cleanFolderName("  Ceremony  ")).toBe("Ceremony");
    expect(cleanFolderName("a\nb")).toBe("ab");
    expect(cleanFolderName("x".repeat(80))).toHaveLength(64);
    expect(cleanFolderName("   ")).toBeNull();
  });
});

describe("folder CRUD", () => {
  it("creates, lists with counts, renames, and rejects case-insensitive dupes", async () => {
    const s = await seedStudio();
    const project = await seedProject(s.organizationId);
    const a1 = await seedAsset({ organizationId: s.organizationId, projectId: project });
    await seedAsset({ organizationId: s.organizationId, projectId: project });

    const f = await createFolder({ organizationId: s.organizationId, projectId: project, name: "Ceremony", actorUserId: s.userId });
    expect(f.ok).toBe(true);
    if (!f.ok) return;
    await moveAssets({ organizationId: s.organizationId, assetIds: [a1], folderId: f.id, actorUserId: s.userId });

    const listed = await listFolders(s.organizationId, project);
    expect(listed.folders).toEqual([{ id: f.id, name: "Ceremony", count: 1 }]);
    expect(listed.unfiledCount).toBe(1);

    const dup = await createFolder({ organizationId: s.organizationId, projectId: project, name: "ceremony", actorUserId: s.userId });
    expect(dup).toEqual({ ok: false, error: "name_taken" });

    const renamed = await renameFolder({ organizationId: s.organizationId, folderId: f.id, name: "Golden hour", actorUserId: s.userId });
    expect(renamed.ok).toBe(true);
    expect((await listFolders(s.organizationId, project)).folders[0]?.name).toBe("Golden hour");
  });

  it("deleting a folder drops its assets back to Unfiled", async () => {
    const s = await seedStudio();
    const project = await seedProject(s.organizationId);
    const f = await createFolder({ organizationId: s.organizationId, projectId: project, name: "Portraits", actorUserId: s.userId });
    if (!f.ok) return;
    const a = await seedAsset({ organizationId: s.organizationId, projectId: project });
    await moveAssets({ organizationId: s.organizationId, assetIds: [a], folderId: f.id, actorUserId: s.userId });

    const del = await deleteFolder({ organizationId: s.organizationId, folderId: f.id, actorUserId: s.userId });
    expect(del.ok).toBe(true);

    const after = await getDb().select().from(schema.assets).where(eq(schema.assets.id, a)).limit(1);
    expect(after[0]?.folderId).toBeNull();
    expect((await listFolders(s.organizationId, project)).folders).toEqual([]);
  });
});

describe("moveAssets", () => {
  it("moves pointers only — storage keys never change", async () => {
    const s = await seedStudio();
    const project = await seedProject(s.organizationId);
    const f = await createFolder({ organizationId: s.organizationId, projectId: project, name: "F", actorUserId: s.userId });
    if (!f.ok) return;
    const a = await seedAsset({ organizationId: s.organizationId, projectId: project });
    const keyBefore = (
      await getDb().select({ k: schema.assets.storageKey }).from(schema.assets).where(eq(schema.assets.id, a)).limit(1)
    )[0]?.k;

    const res = await moveAssets({ organizationId: s.organizationId, assetIds: [a], folderId: f.id, actorUserId: s.userId });
    expect(res.moved).toBe(1);

    const row = (await getDb().select().from(schema.assets).where(eq(schema.assets.id, a)).limit(1))[0];
    expect(row?.folderId).toBe(f.id);
    expect(row?.storageKey).toBe(keyBefore);
  });

  it("skips cross-project assets when filing into a folder", async () => {
    const s = await seedStudio();
    const p1 = await seedProject(s.organizationId, "One");
    const p2 = await seedProject(s.organizationId, "Two");
    const f = await createFolder({ organizationId: s.organizationId, projectId: p1, name: "F", actorUserId: s.userId });
    if (!f.ok) return;
    const mine = await seedAsset({ organizationId: s.organizationId, projectId: p1 });
    const foreign = await seedAsset({ organizationId: s.organizationId, projectId: p2 });

    const res = await moveAssets({ organizationId: s.organizationId, assetIds: [mine, foreign], folderId: f.id, actorUserId: s.userId });
    expect(res.moved).toBe(1);
    const rows = await getDb().select().from(schema.assets).where(eq(schema.assets.projectId, p2));
    expect(rows[0]?.folderId).toBeNull();
  });

  it("another org's folder id moves nothing", async () => {
    const a = await seedStudio();
    const b = await seedStudio();
    const pa = await seedProject(a.organizationId);
    const pb = await seedProject(b.organizationId);
    const fb = await createFolder({ organizationId: b.organizationId, projectId: pb, name: "B-only", actorUserId: b.userId });
    if (!fb.ok) return;
    const asset = await seedAsset({ organizationId: a.organizationId, projectId: pa });

    const res = await moveAssets({ organizationId: a.organizationId, assetIds: [asset], folderId: fb.id, actorUserId: a.userId });
    expect(res.moved).toBe(0);
  });
  it("renaming/deleting another org's folder id is not_found", async () => {
    const a = await seedStudio();
    const b = await seedStudio();
    const pa = await seedProject(a.organizationId);
    const fa = await createFolder({ organizationId: a.organizationId, projectId: pa, name: "A", actorUserId: a.userId });
    if (!fa.ok) return;
    expect(await renameFolder({ organizationId: b.organizationId, folderId: fa.id, name: "Hijack", actorUserId: b.userId })).toEqual({ ok: false, error: "not_found" });
    expect(await deleteFolder({ organizationId: b.organizationId, folderId: fa.id, actorUserId: b.userId })).toEqual({ ok: false, error: "not_found" });
    expect((await listFolders(b.organizationId, pa)).folders).toEqual([]);
  });
});

describe("folder-scoped feed", () => {
  it("folder filter narrows to the folder; 'none' is the unfiled bucket", async () => {
    const s = await seedStudio();
    const project = await seedProject(s.organizationId);
    const f = await createFolder({ organizationId: s.organizationId, projectId: project, name: "F", actorUserId: s.userId });
    if (!f.ok) return;
    const inFolder = await seedAsset({ organizationId: s.organizationId, projectId: project });
    await seedAsset({ organizationId: s.organizationId, projectId: project });
    await moveAssets({ organizationId: s.organizationId, assetIds: [inFolder], folderId: f.id, actorUserId: s.userId });

    const scoped = await listAssetsPaged(s.organizationId, project, { folder: f.id });
    expect(scoped.items.map((i) => i.id)).toEqual([inFolder]);
    expect(scoped.items[0]?.folderId).toBe(f.id);

    const unfiled = await listAssetsPaged(s.organizationId, project, { folder: "none" });
    expect(unfiled.items).toHaveLength(1);
    expect(unfiled.items[0]?.id).not.toBe(inFolder);

    const all = await listAssetsPaged(s.organizationId, project, {});
    expect(all.items).toHaveLength(2);
  });
});

describe("folder-level delivery (WEB-216)", () => {
  async function folderDeliverySetup() {
    const s = await seedStudio();
    const project = await seedProject(s.organizationId);
    const ceremony = await createFolder({ organizationId: s.organizationId, projectId: project, name: "Ceremony", actorUserId: s.userId });
    const party = await createFolder({ organizationId: s.organizationId, projectId: project, name: "Party", actorUserId: s.userId });
    if (!ceremony.ok || !party.ok) throw new Error("folder setup failed");
    const c1 = await seedAsset({ organizationId: s.organizationId, projectId: project, status: "approved" });
    const c2 = await seedAsset({ organizationId: s.organizationId, projectId: project, status: "approved" });
    const p1 = await seedAsset({ organizationId: s.organizationId, projectId: project, status: "approved" });
    const unfiledApproved = await seedAsset({ organizationId: s.organizationId, projectId: project, status: "approved" });
    await seedAsset({ organizationId: s.organizationId, projectId: project, status: "uploaded" }); // not deliverable
    await moveAssets({ organizationId: s.organizationId, assetIds: [c1, c2], folderId: ceremony.id, actorUserId: s.userId });
    await moveAssets({ organizationId: s.organizationId, assetIds: [p1], folderId: party.id, actorUserId: s.userId });
    return { s, project, ceremony, party, c1, c2, p1, unfiledApproved };
  }

  it("expandable via the same route query shape: only approved assets in the picked folders", async () => {
    const { s, project, ceremony, party, c1, c2, p1, unfiledApproved } = await folderDeliverySetup();
    // Mirrors the grants route: folders → approved/shared assets in them.
    const rows = await getDb()
      .select({ id: schema.assets.id })
      .from(schema.assets)
      .where(
        and(
          eq(schema.assets.organizationId, s.organizationId),
          eq(schema.assets.projectId, project),
          inArray(schema.assets.folderId, [ceremony.id, party.id]),
          inArray(schema.assets.status, ["approved", "shared"]),
        ),
      );
    // Folder picks deliver their approved sets — the unfiled approved asset
    // and the still-uploaded one stay out.
    expect(new Set(rows.map((r) => r.id))).toEqual(new Set([c1, c2, p1]));
    expect(rows.map((r) => r.id)).not.toContain(unfiledApproved);
  });

  it("the grant freezes folder labels at delivery — later renames/deletes don't touch the live gallery", async () => {
    const { s, project, ceremony, c1, c2 } = await folderDeliverySetup();
    const created = await createShareGrant({
      organizationId: s.organizationId,
      projectId: project,
      clientEmail: "client@t.test",
      assetIds: [c1, c2],
      expiresAt: null,
      createdById: s.userId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const grant = await resolveGrantByToken(created.token);
    expect(grant).not.toBeNull();
    if (!grant) return;
    expect((await getGrantAssets(grant)).every((a) => a.folder === "Ceremony")).toBe(true);

    await renameFolder({ organizationId: s.organizationId, folderId: ceremony.id, name: "Vows", actorUserId: s.userId });
    await deleteFolder({ organizationId: s.organizationId, folderId: ceremony.id, actorUserId: s.userId });

    // Snapshot survives: the gallery still says Ceremony even though the
    // folder is gone and the assets are unfiled again.
    const still = await getGrantAssets(grant);
    expect(still).toHaveLength(2);
    expect(still.every((a) => a.folder === "Ceremony")).toBe(true);
    expect(still.every((a) => a.folderId === null)).toBe(true);
  });

  it("listFolders can count only the deliverable set (approved/shared)", async () => {
    const { s, project, ceremony } = await folderDeliverySetup();
    // A still-uploaded asset in the folder: counted by the Files rail, not
    // by the gallery delivery picker.
    const draft = await seedAsset({ organizationId: s.organizationId, projectId: project, status: "uploaded" });
    await moveAssets({ organizationId: s.organizationId, assetIds: [draft], folderId: ceremony.id, actorUserId: s.userId });

    const rail = await listFolders(s.organizationId, project);
    expect(rail.folders.find((f) => f.id === ceremony.id)?.count).toBe(3);
    const deliverable = await listFolders(s.organizationId, project, { statuses: ["approved", "shared"] });
    expect(deliverable.folders.find((f) => f.id === ceremony.id)?.count).toBe(2);
  });

  it("regeneration carries the folder snapshot to the new link", async () => {
    const { s, project, c1 } = await folderDeliverySetup();
    const created = await createShareGrant({
      organizationId: s.organizationId,
      projectId: project,
      clientEmail: "client@t.test",
      assetIds: [c1],
      expiresAt: null,
      createdById: s.userId,
    });
    if (!created.ok) return;
    const regen = await regenerateShareGrant({ organizationId: s.organizationId, grantId: created.grantId, actorUserId: s.userId });
    expect(regen.ok).toBe(true);
    if (!regen.ok) return;
    const newGrant = await resolveGrantByToken(regen.token);
    expect(newGrant).not.toBeNull();
    if (!newGrant) return;
    const assets = await getGrantAssets(newGrant);
    expect(assets[0]?.folder).toBe("Ceremony");
  });
});
