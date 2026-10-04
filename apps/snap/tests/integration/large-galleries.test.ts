/* A wedding is hundreds of photos. D1 allows 100 bound variables per query,
 * so every send / renew / revoke / bulk action over a photo list must slice
 * its IN-lists and inserts. These run well past the old 98-photo ceiling. */
import { beforeEach, describe, expect, it } from "vitest";

import { and, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { bulkAssetAction, bulkSetRating } from "@/lib/repos/assets";
import { createShareGrant, regenerateShareGrant, revokeShareGrant } from "@/lib/shares/grants";
import { resetDb } from "../helpers/db";
import { seedAsset, seedProject, seedStudio } from "../helpers/seed";

beforeEach(resetDb);

async function seedMany(n: number, status = "approved") {
  const s = await seedStudio({ plan: "free" });
  const p = await seedProject(s.organizationId);
  const ids: string[] = [];
  for (let i = 0; i < n; i++) ids.push(await seedAsset({ organizationId: s.organizationId, projectId: p, filename: `IMG_${i}.jpg`, status }));
  return { s, p, ids };
}

const statusCount = async (projectId: string, status: string) =>
  (await getDb().select().from(schema.assets).where(and(eq(schema.assets.projectId, projectId), eq(schema.assets.status, status)))).length;

describe("sending a 450-photo wedding (any plan)", () => {
  it("send → renew → revoke all work, and statuses follow", async () => {
    const { s, p, ids } = await seedMany(450);
    const sent = await createShareGrant({ organizationId: s.organizationId, projectId: p, clientEmail: "c@t.test", assetIds: ids, expiresAt: null, createdById: s.userId });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect(await statusCount(p, "shared")).toBe(450);
    const members = await getDb().select().from(schema.shareGrantAssets).where(eq(schema.shareGrantAssets.grantId, sent.grantId));
    expect(members).toHaveLength(450);
    expect(new Set(members.map((m) => m.position)).size).toBe(450);

    const renewed = await regenerateShareGrant({ organizationId: s.organizationId, grantId: sent.grantId, actorUserId: s.userId });
    expect(renewed.ok).toBe(true);
    if (!renewed.ok) return;
    expect(await getDb().select().from(schema.shareGrantAssets).where(eq(schema.shareGrantAssets.grantId, renewed.grantId))).toHaveLength(450);
    expect(await statusCount(p, "shared")).toBe(450);

    expect((await revokeShareGrant({ organizationId: s.organizationId, grantId: renewed.grantId, actorUserId: s.userId })).ok).toBe(true);
    expect(await statusCount(p, "shared")).toBe(0);
    expect(await statusCount(p, "approved")).toBe(450);
  }, 120_000);

  it("a foreign photo anywhere in a big list is still rejected", async () => {
    const mine = await seedMany(150);
    const theirs = await seedMany(1);
    const r = await createShareGrant({
      organizationId: mine.s.organizationId, projectId: mine.p, clientEmail: "c@t.test",
      assetIds: [...mine.ids, theirs.ids[0]], expiresAt: null, createdById: mine.s.userId,
    });
    expect(r).toEqual({ ok: false, error: "asset_mismatch" });
    expect(await statusCount(mine.p, "shared")).toBe(0);
  }, 120_000);
});

describe("Files-tab bulk actions on 'select all' (up to 500)", () => {
  it("approve / reject / reset / tag / untag / rate 300 photos", async () => {
    const { s, p, ids } = await seedMany(300, "uploaded");
    const actor = s.userId;
    expect((await bulkAssetAction(s.organizationId, { action: "approve", assetIds: ids, actorUserId: actor })).done).toBe(300);
    expect(await statusCount(p, "approved")).toBe(300);
    expect((await bulkAssetAction(s.organizationId, { action: "reject", assetIds: ids, actorUserId: actor })).done).toBe(300);
    expect(await statusCount(p, "rejected")).toBe(300);
    expect((await bulkAssetAction(s.organizationId, { action: "reset", assetIds: ids, actorUserId: actor })).done).toBe(300);
    expect(await statusCount(p, "uploaded")).toBe(300);

    expect((await bulkAssetAction(s.organizationId, { action: "tag", assetIds: ids, tag: "keeper", actorUserId: actor })).done).toBe(300);
    expect(await getDb().select().from(schema.assetTags).where(eq(schema.assetTags.tag, "keeper"))).toHaveLength(300);
    expect((await bulkAssetAction(s.organizationId, { action: "untag", assetIds: ids, tag: "keeper", actorUserId: actor })).done).toBe(300);
    expect(await getDb().select().from(schema.assetTags).where(eq(schema.assetTags.tag, "keeper"))).toHaveLength(0);

    expect(await bulkSetRating(s.organizationId, ids, { stars: 4 })).toBe(300);
  }, 120_000);

  it("rejecting 250 photos that are in a live gallery is blocked for all of them, without crashing", async () => {
    const { s, p, ids } = await seedMany(250);
    await createShareGrant({ organizationId: s.organizationId, projectId: p, clientEmail: "c@t.test", assetIds: ids, expiresAt: null, createdById: s.userId });
    const res = await bulkAssetAction(s.organizationId, { action: "reject", assetIds: ids, actorUserId: s.userId });
    expect(res.done).toBe(0);
    expect(res.blocked).toHaveLength(250);
    expect(await statusCount(p, "rejected")).toBe(0);
  }, 120_000);

  it("deletes 200 photos in one go", async () => {
    const { s, p, ids } = await seedMany(200);
    const res = await bulkAssetAction(s.organizationId, { action: "delete", assetIds: ids, actorUserId: s.userId });
    expect(res.done).toBe(200);
    expect((await getDb().select().from(schema.assets).where(eq(schema.assets.projectId, p))).length).toBe(0);
  }, 120_000);
});
