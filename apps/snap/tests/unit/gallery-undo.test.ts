/* WEB-249 — the persisted template-undo snapshot: applying a template saves
 * the replaced design on the project row (so Undo survives a reload), the
 * picker hydrates from it, and any design save — the undo restore itself
 * included — clears it. One level of undo. Repo-level against the real D1
 * (routes can't run under workerd; the routes only sequence these calls). */
import { beforeEach, describe, expect, it } from "vitest";

import { getProjectGalleryDesign, getProjectGalleryUndo, saveProjectGalleryDesign, saveProjectGalleryUndo } from "@/lib/repos/gallery-design";
import { adaptSeedToProject, seedTemplateOf } from "@/lib/seed-templates";
import { parseGalleryDesign, type GalleryDesign } from "@/lib/gallery-design";

import { resetDb } from "../helpers/db";
import { seedAsset, seedProject, seedStudio } from "../helpers/seed";

beforeEach(resetDb);

/** A canonically-parsed seed design — what the repo round-trips (the raw seed
 * object may contain fields the canonical form drops). */
function design(key: string): GalleryDesign {
  return parseGalleryDesign(structuredClone(seedTemplateOf(key)!.design))!;
}

describe("gallery undo snapshot (WEB-249)", () => {
  it("round-trips: a saved snapshot reads back intact — the reload contract", async () => {
    const { organizationId } = await seedStudio();
    const projectId = await seedProject(organizationId);
    const previous = design("classic-wedding");

    expect(await saveProjectGalleryUndo({ organizationId, projectId, design: previous })).toEqual({ ok: true });
    // A fresh read is what a remounted picker hydrates from.
    expect(await getProjectGalleryUndo(organizationId, projectId)).toEqual(previous);
  });

  it("null clears the snapshot (undo is one level)", async () => {
    const { organizationId } = await seedStudio();
    const projectId = await seedProject(organizationId);
    await saveProjectGalleryUndo({ organizationId, projectId, design: design("soft-serif") });
    await saveProjectGalleryUndo({ organizationId, projectId, design: null });
    expect(await getProjectGalleryUndo(organizationId, projectId)).toBeNull();
  });

  it("the apply → reload → undo flow restores the previous design and ends the window", async () => {
    const { organizationId } = await seedStudio({ plan: "pro" });
    const projectId = await seedProject(organizationId);
    // Real project photos, as the apply route remaps seed picks onto them —
    // the design save path enforces asset ownership.
    const photos = [
      await seedAsset({ organizationId, projectId, kind: "image", status: "approved" }),
      await seedAsset({ organizationId, projectId, kind: "image", status: "approved" }),
    ];
    const previous = parseGalleryDesign(adaptSeedToProject(seedTemplateOf("classic-wedding")!, photos))!;
    const applied = parseGalleryDesign(adaptSeedToProject(seedTemplateOf("soft-serif")!, photos))!;

    // apply: new design saved, replaced design snapshotted
    await saveProjectGalleryDesign({ organizationId, projectId, design: applied });
    await saveProjectGalleryUndo({ organizationId, projectId, design: previous });
    expect(await getProjectGalleryDesign(organizationId, projectId)).toEqual(applied);

    // "reload": undo comes from the persisted snapshot, not client state
    const undoDesign = await getProjectGalleryUndo(organizationId, projectId);
    expect(undoDesign).toEqual(previous);

    // restore through the design save path, then the snapshot clears
    await saveProjectGalleryDesign({ organizationId, projectId, design: undoDesign });
    await saveProjectGalleryUndo({ organizationId, projectId, design: null });
    expect(await getProjectGalleryDesign(organizationId, projectId)).toEqual(previous);
    expect(await getProjectGalleryUndo(organizationId, projectId)).toBeNull();
  });

  it("re-applying overwrites the snapshot with the newer replaced design", async () => {
    const { organizationId } = await seedStudio();
    const projectId = await seedProject(organizationId);
    await saveProjectGalleryUndo({ organizationId, projectId, design: design("classic-wedding") });
    await saveProjectGalleryUndo({ organizationId, projectId, design: design("editorial-wedding") });
    expect(await getProjectGalleryUndo(organizationId, projectId)).toEqual(design("editorial-wedding"));
  });

  it("rejects an unparsable snapshot without writing", async () => {
    const { organizationId } = await seedStudio();
    const projectId = await seedProject(organizationId);
    const bad = { template: 42, sections: "nope" } as unknown as GalleryDesign;
    expect(await saveProjectGalleryUndo({ organizationId, projectId, design: bad })).toEqual({ ok: false, error: "invalid_design" });
    expect(await getProjectGalleryUndo(organizationId, projectId)).toBeNull();
  });

  it("is scoped to the org — another org reads nothing", async () => {
    const a = await seedStudio();
    const b = await seedStudio();
    const projectId = await seedProject(a.organizationId);
    await saveProjectGalleryUndo({ organizationId: a.organizationId, projectId, design: design("classic-wedding") });
    expect(await getProjectGalleryUndo(b.organizationId, projectId)).toBeNull();
  });
});
