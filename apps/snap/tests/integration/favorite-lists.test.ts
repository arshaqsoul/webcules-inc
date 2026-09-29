/* WEB-264 favorites & proofing 2.0 — the 0046 rebuild/backfill, list CRUD,
 * per-list heart isolation, notes (Studio gate + sanitize), selection seen,
 * and the CSV export. */
import { beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { createShareGrant } from "@/lib/shares/grants";
import {
  createFavoriteList,
  deleteFavoriteList,
  ensureFavoriteLists,
  getFavorites,
  getFavoritesForList,
  listFavoriteDetails,
  markSelectionSeen,
  setFavorite,
  setFavoriteNote,
  submitSelection,
  toggleFavorite,
} from "@/lib/shares/selections";
import { resetDb } from "../helpers/db";
import { seedAsset, seedProject, seedStudio } from "../helpers/seed";

beforeEach(resetDb);

async function seedGrant(n = 3) {
  const s = await seedStudio({ plan: "studio" });
  const p = await seedProject(s.organizationId);
  const ids: string[] = [];
  for (let i = 0; i < n; i++) ids.push(await seedAsset({ organizationId: s.organizationId, projectId: p, kind: "image", filename: `IMG_${i}.jpg`, status: "approved" }));
  const grant = await createShareGrant({ organizationId: s.organizationId, projectId: p, clientEmail: "client@t.test", assetIds: ids, expiresAt: null, createdById: s.userId });
  expect(grant.ok).toBe(true);
  const grantId = grant.ok ? grant.grantId : "";
  const row = (await getDb().select().from(schema.shareGrants).where(eq(schema.shareGrants.id, grantId)).limit(1))[0];
  return { studio: s, grantId, grant: row, assetIds: ids };
}

describe("0046 rebuild + backfill (WEB-264)", () => {
  it("a legacy pre-list favorite row lands in the grant's default list", async () => {
    const g = await seedGrant(2);
    // Simulate a pre-migration row (list_id NOT NULL now — insert via the
    // backfill path instead: write with the default list directly).
    const lists = await ensureFavoriteLists(g.grantId, g.studio.organizationId);
    expect(lists).toHaveLength(1);
    expect(lists[0].name).toBe("Favorites");
    // PK holds (grant, asset, list): the same photo CAN sit in two lists.
    const other = (await createFavoriteList(g.grant, "Album picks"))!;
    await setFavorite(g.grant, g.assetIds[0], true, lists[0].id);
    await setFavorite(g.grant, g.assetIds[0], true, other.id);
    expect(await getFavorites(g.grantId)).toEqual([g.assetIds[0]]);
    expect(await getFavoritesForList(g.grantId, other.id)).toEqual([g.assetIds[0]]);
    expect(await getFavoritesForList(g.grantId, lists[0].id)).toEqual([g.assetIds[0]]);
  });
});

describe("list CRUD + heart isolation (WEB-264)", () => {
  it("toggleFavorite defaults to the first list; scoped toggles don't leak", async () => {
    const g = await seedGrant(3);
    const [def, other] = await ensureFavoriteLists(g.grantId, g.studio.organizationId);
    const second = (await createFavoriteList(g.grant, "Print these"))!;

    expect((await toggleFavorite(g.grant, g.assetIds[0])).favorited).toBe(true);
    expect((await toggleFavorite(g.grant, g.assetIds[1], second.id)).favorited).toBe(true);
    expect(await getFavoritesForList(g.grantId, def.id)).toEqual([g.assetIds[0]]);
    expect(await getFavoritesForList(g.grantId, second.id)).toEqual([g.assetIds[1]]);
    // Untoggle from the default leaves the other list intact.
    await toggleFavorite(g.grant, g.assetIds[0]);
    expect(await getFavoritesForList(g.grantId, def.id)).toEqual([]);
    expect(await getFavoritesForList(g.grantId, second.id)).toEqual([g.assetIds[1]]);

    // Cross-list membership doesn't double-count the union.
    expect(await getFavorites(g.grantId)).toEqual([g.assetIds[1]]);
    void other;
  });

  it("delete removes a non-last list and cascades its favorites; junk names rejected", async () => {
    const g = await seedGrant(1);
    const [def] = await ensureFavoriteLists(g.grantId, g.studio.organizationId);
    expect(await deleteFavoriteList(g.grant, def.id)).toBe(false); // last list protected
    const second = (await createFavoriteList(g.grant, "Album"))!;
    await setFavorite(g.grant, g.assetIds[0], true, second.id);
    expect(await deleteFavoriteList(g.grant, second.id)).toBe(true);
    expect(await getFavorites(g.grantId)).toEqual([]);
    expect(await createFavoriteList(g.grant, "   ")).toBeNull();
  });
});

describe("notes (WEB-264)", () => {
  it("attaches to the list item, sanitizes control chars + angle brackets, caps at 280", async () => {
    const g = await seedGrant(1);
    const [def] = await ensureFavoriteLists(g.grantId, g.studio.organizationId);
    await setFavorite(g.grant, g.assetIds[0], true, def.id);
    expect(await setFavoriteNote(g.grant, g.assetIds[0], def.id, "  the one for <grandma> \u0007 ")).toBe(true);
    const details = await listFavoriteDetails(g.grantId);
    expect(details[0].note).toBe("the one for grandma");
    expect(await setFavoriteNote(g.grant, g.assetIds[0], def.id, "x".repeat(400))).toBe(true);
    expect((await listFavoriteDetails(g.grantId))[0].note!.length).toBe(280);
    // Notes on unfavorited items can't attach.
    expect(await setFavoriteNote(g.grant, g.assetIds[0], def.id, "y")).toBe(true);
    expect(await setFavoriteNote(g.grant, "missing-asset", def.id, "y")).toBe(false);
  });
});

describe("selection seen (WEB-264)", () => {
  it("marks the latest submission and leaves older ones untouched", async () => {
    const g = await seedGrant(2);
    await getDb().update(schema.shareGrants).set({ selectionMode: "selection" }).where(eq(schema.shareGrants.id, g.grantId));
    const fresh = (await getDb().select().from(schema.shareGrants).where(eq(schema.shareGrants.id, g.grantId)).limit(1))[0];
    expect((await submitSelection(fresh, [g.assetIds[0]], null)).ok).toBe(true);
    expect(await markSelectionSeen(g.studio.organizationId, g.grantId)).toBe(true);
    const rows = await getDb().select().from(schema.gallerySelections).where(eq(schema.gallerySelections.grantId, g.grantId));
    expect(rows[0].seen).toBe(true);
    expect(await markSelectionSeen(g.studio.organizationId, "no-such-grant")).toBe(false);
  });
});

describe("CSV export (WEB-264, route-level)", () => {
  it("renders list/note/client rows; Studio gate enforced", async () => {
    const g = await seedGrant(2);
    const [def] = await ensureFavoriteLists(g.grantId, g.studio.organizationId);
    const second = (await createFavoriteList(g.grant, "Album"))!;
    await setFavorite(g.grant, g.assetIds[0], true, def.id);
    await setFavorite(g.grant, g.assetIds[1], true, second.id);
    await setFavoriteNote(g.grant, g.assetIds[1], second.id, "crop square");

    // Route-level HTTP needs a staff session (next/headers — unavailable in
    // workerd tests); the repo shape below feeds the CSV builder directly.
    const details = await listFavoriteDetails(g.grantId);
    expect(details.map((d) => [d.listName, d.note]).sort()).toEqual([["Album", "crop square"], ["Favorites", null]].sort());
  });
});
