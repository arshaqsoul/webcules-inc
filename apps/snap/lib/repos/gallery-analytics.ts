/* Gallery analytics repository (WEB-265) — everything the Activity panel
 * shows, read from the same tables the budget counters write (one source
 * of truth): share_access_log events, gallery/asset view counters,
 * favorites/selections/downloads. Reconciliation-friendly by construction. */

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";

export type ClientActivity = {
  clientEmail: string;
  views: number;
  lastViewedAt: string | null;
  favorites: number;
  downloads: number;
  zipDownloads: number;
  shareViews: number;
  selection: { count: number; submittedAt: string | null; seen: boolean } | null;
};

export type ActivityEvent = {
  id: string;
  clientEmail: string;
  event: string;
  createdAt: string;
};

export type GalleryAnalytics = {
  totals: { views: number; uniqueClients: number; lastViewedAt: string | null; downloads: number; shareViews: number; shareCards: number };
  clients: ClientActivity[];
  events: ActivityEvent[];
};

const FAVORITE_EVENTS = new Set(["view", "download", "zip_download", "share_view", "share_create", "otp_success"]);

export async function getGalleryAnalytics(organizationId: string, projectId: string, limit = 30): Promise<GalleryAnalytics> {
  const db = getDb();
  const grants = await db
    .select({ id: schema.shareGrants.id, clientEmail: schema.shareGrants.clientEmail })
    .from(schema.shareGrants)
    .where(and(eq(schema.shareGrants.organizationId, organizationId), eq(schema.shareGrants.projectId, projectId)));
  if (!grants.length) {
    return { totals: { views: 0, uniqueClients: 0, lastViewedAt: null, downloads: 0, shareViews: 0, shareCards: 0 }, clients: [], events: [] };
  }
  const emailByGrant = new Map(grants.map((g) => [g.id, g.clientEmail]));
  const grantIds = Array.from(emailByGrant.keys());

  // Monthly gallery counter = the canonical view total (budget's own source).
  const viewRows = await db
    .all<{ grant_id: string; n: number; last: number }>(sql`
      SELECT grant_id, SUM(views) AS n, 0 AS last FROM gallery_view_monthly WHERE grant_id IN (${sql.join(grantIds.map((g) => sql`${g}`), sql`, `)}) GROUP BY grant_id
    `);
  const viewsByGrant = new Map(viewRows.map((r) => [r.grant_id, r.n]));

  const [lastRows, dlRows, shareRows, favRows] = await Promise.all([
    db
      .select({ grantId: schema.shareAccessLogs.grantId, last: sql<number>`max(${schema.shareAccessLogs.createdAt})` })
      .from(schema.shareAccessLogs)
      .where(and(inArray(schema.shareAccessLogs.grantId, grantIds), eq(schema.shareAccessLogs.event, "view")))
      .groupBy(schema.shareAccessLogs.grantId),
    db
      .select({ grantId: schema.shareAccessLogs.grantId, event: schema.shareAccessLogs.event, n: sql<number>`count(*)` })
      .from(schema.shareAccessLogs)
      .where(and(inArray(schema.shareAccessLogs.grantId, grantIds), inArray(schema.shareAccessLogs.event, ["download", "zip_download", "share_view", "share_create"])))
      .groupBy(schema.shareAccessLogs.grantId, schema.shareAccessLogs.event),
    db
      .select({ grantId: schema.photoShares.grantId, n: sql<number>`count(*)` })
      .from(schema.photoShares)
      .where(inArray(schema.photoShares.grantId, grantIds))
      .groupBy(schema.photoShares.grantId),
    db
      .select({ grantId: schema.galleryFavorites.grantId, n: sql<number>`count(*)` })
      .from(schema.galleryFavorites)
      .where(inArray(schema.galleryFavorites.grantId, grantIds))
      .groupBy(schema.galleryFavorites.grantId),
  ]);
  const lastByGrant = new Map(lastRows.map((r) => [r.grantId, r.last]));
  const dlMap = new Map<string, { download?: number; zip_download?: number; share_view?: number; share_create?: number }>();
  for (const r of dlRows) {
    const cur = dlMap.get(r.grantId) ?? {};
    cur[r.event as "download"] = r.n;
    dlMap.set(r.grantId, cur);
  }
  const shareCardsByGrant = new Map(shareRows.map((r) => [r.grantId, r.n]));
  const favByGrant = new Map(favRows.map((r) => [r.grantId, r.n]));

  const selections = await db
    .select()
    .from(schema.gallerySelections)
    .where(inArray(schema.gallerySelections.grantId, grantIds))
    .orderBy(desc(schema.gallerySelections.submittedAt));
  const selectionByGrant = new Map<string, typeof selections[number]>();
  for (const s of selections) if (!selectionByGrant.has(s.grantId)) selectionByGrant.set(s.grantId, s);

  const clients: ClientActivity[] = grants.map((g) => {
    const sel = selectionByGrant.get(g.id);
    const d = dlMap.get(g.id) ?? {};
    return {
      clientEmail: g.clientEmail,
      views: viewsByGrant.get(g.id) ?? 0,
      lastViewedAt: lastByGrant.get(g.id) ? new Date(lastByGrant.get(g.id)! * 1000).toISOString() : null,
      favorites: favByGrant.get(g.id) ?? 0,
      downloads: d.download ?? 0,
      zipDownloads: d.zip_download ?? 0,
      shareViews: d.share_view ?? 0,
      selection: sel
        ? {
            count: JSON.parse(sel.itemsJson || "[]").length,
            submittedAt: sel.submittedAt.toISOString(),
            seen: sel.seen,
          }
        : null,
    };
  });

  const eventRows = await db
    .select({ id: schema.shareAccessLogs.id, grantId: schema.shareAccessLogs.grantId, event: schema.shareAccessLogs.event, createdAt: schema.shareAccessLogs.createdAt })
    .from(schema.shareAccessLogs)
    .where(and(inArray(schema.shareAccessLogs.grantId, grantIds), inArray(schema.shareAccessLogs.event, [...FAVORITE_EVENTS])))
    .orderBy(desc(schema.shareAccessLogs.createdAt))
    .limit(limit);

  const totals = {
    views: clients.reduce((n, c) => n + c.views, 0),
    uniqueClients: new Set(grants.map((g) => g.clientEmail)).size,
    lastViewedAt: clients.reduce<string | null>((best, c) => (c.lastViewedAt && (!best || c.lastViewedAt > best) ? c.lastViewedAt : best), null),
    downloads: clients.reduce((n, c) => n + c.downloads + c.zipDownloads, 0),
    shareViews: clients.reduce((n, c) => n + c.shareViews, 0),
    shareCards: grants.reduce((n, g) => n + (shareCardsByGrant.get(g.id) ?? 0), 0),
  };

  return {
    totals,
    clients,
    events: eventRows.map((e) => ({ id: e.id, clientEmail: emailByGrant.get(e.grantId) ?? "", event: e.event, createdAt: e.createdAt.toISOString() })),
  };
}
