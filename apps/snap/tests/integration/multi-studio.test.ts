/* Multi-studio (WEB-217): family resolution, POOLED entitlements (the
 * non-negotiable pricing condition), plan resolution through the root, and
 * link/unlink semantics. Everything else (embeds, CRM, invoices, Connect,
 * dormancy) stays per-org by construction — nothing here changes scoping. */
import { beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { PLANS, getPlanEntitlements, resolveFamily } from "@/lib/plans";
import {
  createFamilyStudio,
  linkStudioToFamily,
  listUserStudios,
  unlinkStudioFromFamily,
} from "@/lib/repos/studios";
import { resetDb } from "../helpers/db";
import { seedAsset, seedProject, seedStudio } from "../helpers/seed";

beforeEach(async () => {
  await resetDb();
});

async function setParent(childId: string, parentId: string) {
  await getDb().update(schema.organization).set({ parentOrganizationId: parentId }).where(eq(schema.organization.id, childId));
}

describe("PLANS studio limits", () => {
  it("Free 1 · Lite 3 · Studio/Pro unlimited", () => {
    expect(PLANS.free.maxLinkedStudios).toBe(1);
    expect(PLANS.lite.maxLinkedStudios).toBe(3);
    expect(PLANS.studio.maxLinkedStudios).toBeNull();
    expect(PLANS.pro.maxLinkedStudios).toBeNull();
  });
});

describe("resolveFamily", () => {
  it("standalone org is its own family", async () => {
    const s = await seedStudio();
    const f = await resolveFamily(s.organizationId);
    expect(f).toEqual({ rootId: s.organizationId, ids: [s.organizationId] });
  });

  it("walks to the root and includes all children", async () => {
    const parent = await seedStudio({ name: "Parent" });
    const c1 = await seedStudio({ name: "C1" });
    const c2 = await seedStudio({ name: "C2" });
    await setParent(c1.organizationId, parent.organizationId);
    await setParent(c2.organizationId, parent.organizationId);

    const fromChild = await resolveFamily(c1.organizationId);
    expect(fromChild.rootId).toBe(parent.organizationId);
    expect(new Set(fromChild.ids)).toEqual(new Set([parent.organizationId, c1.organizationId, c2.organizationId]));
  });
});

describe("pooled entitlements", () => {
  it("usage and plan resolve through the root: child sees the family's plan and summed usage", async () => {
    const parent = await seedStudio({ plan: "lite", name: "Weddings" });
    const child = await seedStudio({ plan: "free", name: "Boudoir" });
    await setParent(child.organizationId, parent.organizationId);

    const pp = await seedProject(parent.organizationId, "Wedding");
    const cp = await seedProject(child.organizationId, "Shoot");
    await seedAsset({ organizationId: parent.organizationId, projectId: pp, bytes: 10 * 1024 ** 3 });
    await seedAsset({ organizationId: child.organizationId, projectId: cp, bytes: 5 * 1024 ** 3 });

    const ent = await getPlanEntitlements(child.organizationId);
    expect(ent).not.toBeNull();
    if (!ent) return;
    // plan comes from the ROOT (lite), not the child's own 'free' row
    expect(ent.id).toBe("lite");
    expect(ent.storageUsedBytes).toBe(15 * 1024 ** 3);
    expect(ent.rootOrganizationId).toBe(parent.organizationId);
    expect(ent.isFamilyChild).toBe(true);
    expect(ent.familyStudioCount).toBe(2);

    // the parent sees the identical envelope
    const rootEnt = await getPlanEntitlements(parent.organizationId);
    expect(rootEnt?.storageUsedBytes).toBe(ent.storageUsedBytes);
    expect(rootEnt?.isFamilyChild).toBe(false);
  });

  it("active galleries pool across the family (Lite 15 shared, not 15 each)", async () => {
    const parent = await seedStudio({ plan: "lite" });
    const child = await seedStudio();
    await setParent(child.organizationId, parent.organizationId);
    const { createShareGrant } = await import("@/lib/shares/grants");
    const pp = await seedProject(parent.organizationId);
    const cp = await seedProject(child.organizationId);
    const a1 = await seedAsset({ organizationId: parent.organizationId, projectId: pp });
    const a2 = await seedAsset({ organizationId: child.organizationId, projectId: cp });
    const g1 = await createShareGrant({ organizationId: parent.organizationId, projectId: pp, clientEmail: "a@t.test", assetIds: [a1], expiresAt: null, createdById: parent.userId });
    const g2 = await createShareGrant({ organizationId: child.organizationId, projectId: cp, clientEmail: "b@t.test", assetIds: [a2], expiresAt: null, createdById: child.userId });
    expect(g1.ok && g2.ok).toBe(true);

    const ent = await getPlanEntitlements(child.organizationId);
    expect(ent?.activeGalleries).toBe(2);
  });
});

describe("createFamilyStudio", () => {
  it("creates a full org linked to the root, owned by the caller", async () => {
    const root = await seedStudio({ plan: "lite" });
    const created = await createFamilyStudio({
      userId: root.userId,
      rootOrganizationId: root.organizationId,
      studioName: "Corporate",
      timezone: "America/Regina",
    });
    const org = (await getDb().select().from(schema.organization).where(eq(schema.organization.id, created.organizationId)).limit(1))[0];
    expect(org?.parentOrganizationId).toBe(root.organizationId);

    // owner membership + fresh profile (per-studio embed key/branding)
    const member = (await getDb().select().from(schema.member).where(eq(schema.member.organizationId, created.organizationId)).limit(1))[0];
    expect(member?.userId).toBe(root.userId);
    expect(member?.role).toBe("owner");
    const profile = (await getDb().select().from(schema.studioProfiles).where(eq(schema.studioProfiles.organizationId, created.organizationId)).limit(1))[0];
    expect(profile?.embedKey).toBeTruthy();
    expect(profile?.timezone).toBe("America/Regina");

    // the new studio is instantly in the family envelope
    const ent = await getPlanEntitlements(created.organizationId);
    expect(ent?.familyStudioCount).toBe(2);
    expect(ent?.id).toBe("lite");
  });
});

describe("link / unlink semantics", () => {
  it("links a standalone org and refuses cycles / already-family targets", async () => {
    const root = await seedStudio({ plan: "studio" });
    const other = await seedStudio({ name: "Other" });
    const child = await seedStudio({ name: "Child" });
    await setParent(child.organizationId, root.organizationId);

    // link the standalone org
    const ok = await linkStudioToFamily({ rootOrganizationId: root.organizationId, organizationId: other.organizationId, actorUserId: root.userId });
    expect(ok.ok).toBe(true);

    // self-link is a cycle
    const self = await linkStudioToFamily({ rootOrganizationId: root.organizationId, organizationId: root.organizationId, actorUserId: root.userId });
    expect(self).toEqual({ ok: false, error: "cycle" });

    // a child of another family can't be re-parented
    const foreignChild = await linkStudioToFamily({ rootOrganizationId: root.organizationId, organizationId: child.organizationId, actorUserId: root.userId });
    expect(foreignChild).toEqual({ ok: false, error: "has_family" });

    // an org with children can never be re-parented (families stay one level)
    const grandchild = await seedStudio({ name: "Grandchild" });
    await setParent(grandchild.organizationId, other.organizationId);
    const reverse = await linkStudioToFamily({ rootOrganizationId: grandchild.organizationId, organizationId: other.organizationId, actorUserId: root.userId });
    expect(reverse).toEqual({ ok: false, error: "has_family" });
  });

  it("unlink only works for direct children; the root can't leave its own family", async () => {
    const root = await seedStudio();
    const child = await seedStudio();
    const stranger = await seedStudio();
    await setParent(child.organizationId, root.organizationId);

    const self = await unlinkStudioFromFamily({ rootOrganizationId: root.organizationId, organizationId: root.organizationId, actorUserId: root.userId });
    expect(self).toEqual({ ok: false, error: "cycle" });

    const notChild = await unlinkStudioFromFamily({ rootOrganizationId: root.organizationId, organizationId: stranger.organizationId, actorUserId: root.userId });
    expect(notChild).toEqual({ ok: false, error: "not_a_child" });

    const ok = await unlinkStudioFromFamily({ rootOrganizationId: root.organizationId, organizationId: child.organizationId, actorUserId: root.userId });
    expect(ok.ok).toBe(true);
    const org = (await getDb().select().from(schema.organization).where(eq(schema.organization.id, child.organizationId)).limit(1))[0];
    expect(org?.parentOrganizationId).toBeNull();
  });
});

describe("listUserStudios", () => {
  it("returns every membership with its family link", async () => {
    const root = await seedStudio({ name: "Weddings" });
    const created = await createFamilyStudio({
      userId: root.userId,
      rootOrganizationId: root.organizationId,
      studioName: "Boudoir",
      timezone: "UTC",
    });
    const studios = await listUserStudios(root.userId);
    const byId = new Map(studios.map((s) => [s.organizationId, s]));
    expect(byId.get(root.organizationId)).toMatchObject({ name: "Weddings", parentOrganizationId: null, role: "owner" });
    expect(byId.get(created.organizationId)).toMatchObject({ name: "Boudoir", parentOrganizationId: root.organizationId, role: "owner" });
  });
});
