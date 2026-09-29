/* WEB-265 gallery analytics — counter upserts, per-asset aggregates, and
 * the Activity panel's reconciliation against the raw tables. */
import { beforeEach, describe, expect, it } from "vitest";

import { eq, and } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { assetViewTotals, countAssetView } from "@/lib/limits";
import { getGalleryAnalytics } from "@/lib/repos/gallery-analytics";
import { createShareGrant, revokeShareGrant } from "@/lib/shares/grants";
import { logShareAccess } from "@/lib/shares/gallery-auth";
import { resetDb } from "../helpers/db";
import { seedAsset, seedProject, seedStudio } from "../helpers/seed";

beforeEach(resetDb);

async function seedGallery() {
  const s = await seedStudio({ plan: "studio" });
  const p = await seedProject(s.organizationId);
  const ids = [
    await seedAsset({ organizationId: s.organizationId, projectId: p, kind: "image", filename: "a.jpg", status: "approved" }),
    await seedAsset({ organizationId: s.organizationId, projectId: p, kind: "image", filename: "b.jpg", status: "approved" }),
  ];
  const grant = await createShareGrant({ organizationId: s.organizationId, projectId: p, clientEmail: "client@t.test", assetIds: ids, expiresAt: null, createdById: s.userId });
  expect(grant.ok).toBe(true);
  return { studio: s, project: p, assetIds: ids, grantId: grant.ok ? grant.grantId : "" };
}

describe("per-asset counters (WEB-265)", () => {
  it("upserts per asset+month and aggregates all-time totals", async () => {
    const g = await seedGallery();
    await countAssetView(g.studio.organizationId, g.grantId, g.assetIds[0]);
    await countAssetView(g.studio.organizationId, g.grantId, g.assetIds[0]);
    await countAssetView(g.studio.organizationId, g.grantId, g.assetIds[1]);

    const totals = await assetViewTotals(g.grantId);
    expect(totals.get(g.assetIds[0])).toBe(2);
    expect(totals.get(g.assetIds[1])).toBe(1);

    // Same month → single row (upsert, not append).
    const rows = await getDb().select().from(schema.assetViewMonthly).where(eq(schema.assetViewMonthly.grantId, g.grantId));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.assetId === g.assetIds[0])?.views).toBe(2);
  });
});

describe("activity reconciliation (WEB-265)", () => {
  it("totals match the raw tables: counter views, event downloads, favorites, selections", async () => {
    const g = await seedGallery();
    const db = getDb();

    // Two admitted views (counter path) + a download + a share_view.
    await countAssetView(g.studio.organizationId, g.grantId, g.assetIds[0]);
    await countAssetView(g.studio.organizationId, g.grantId, g.assetIds[0]);
    // The gallery's own monthly counter is the canonical view total.
    await db.all(
      (await import("drizzle-orm")).sql`INSERT INTO gallery_view_monthly (organization_id, grant_id, month, views) VALUES (${g.studio.organizationId}, ${g.grantId}, '2099-01', 5) ON CONFLICT DO UPDATE SET views = views + 5`,
    );
    const req = new Request("https://x/");
    await logShareAccess(g.grantId, "download", req);
    await logShareAccess(g.grantId, "zip_download", req);
    await logShareAccess(g.grantId, "share_view", req);
    await logShareAccess(g.grantId, "view", req);
    // A favorite.
    const { toggleFavorite } = await import("@/lib/shares/selections");
    const grantRow = (await db.select().from(schema.shareGrants).where(eq(schema.shareGrants.id, g.grantId)).limit(1))[0];
    await toggleFavorite(grantRow, g.assetIds[0]);
    // A selection.
    await db.update(schema.shareGrants).set({ selectionMode: "selection" }).where(eq(schema.shareGrants.id, g.grantId));
    const fresh = (await db.select().from(schema.shareGrants).where(eq(schema.shareGrants.id, g.grantId)).limit(1))[0];
    const { submitSelection } = await import("@/lib/shares/selections");
    expect((await submitSelection(fresh, [g.assetIds[1]], null)).ok).toBe(true);

    const a = await getGalleryAnalytics(g.studio.organizationId, g.project);
    expect(a.totals.views).toBe(5); // from gallery_view_monthly (canonical)
    expect(a.totals.uniqueClients).toBe(1);
    expect(a.totals.downloads).toBe(2); // download + zip_download
    expect(a.totals.shareViews).toBe(1);
    expect(a.clients).toHaveLength(1);
    const c = a.clients[0];
    expect(c.clientEmail).toBe("client@t.test");
    expect(c.views).toBe(5);
    expect(c.favorites).toBe(1);
    expect(c.downloads).toBe(1);
    expect(c.zipDownloads).toBe(1);
    expect(c.selection?.count).toBe(1);
    expect(c.selection?.seen).toBe(false);
    // The recent feed carries the surfaced event types.
    expect(a.events.some((e) => e.event === "view")).toBe(true);
    expect(a.events.some((e) => e.event === "download")).toBe(true);
  });

  it("revoked grants drop out of unique clients but keep their history rows out of totals", async () => {
    const g = await seedGallery();
    await revokeShareGrant({ organizationId: g.studio.organizationId, grantId: g.grantId, actorUserId: g.studio.userId });
    const a = await getGalleryAnalytics(g.studio.organizationId, g.project);
    // Client rows still render (history) but views come from the counter —
    // which this test never bumped → zero.
    expect(a.clients).toHaveLength(1);
    expect(a.totals.views).toBe(0);
  });
});
