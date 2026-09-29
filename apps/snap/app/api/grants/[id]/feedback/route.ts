/* Staff view of client feedback for one grant — favorited asset ids and the
 * latest submitted selection (with note), org-scoped. */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getFavorites, getLatestSelection, listFavoriteDetails } from "@/lib/shares/selections";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const grantId = (await params).id;

  const grant = (
    await getDb()
      .select({ id: schema.shareGrants.id })
      .from(schema.shareGrants)
      .where(and(eq(schema.shareGrants.id, grantId), eq(schema.shareGrants.organizationId, ctx.organizationId)))
      .limit(1)
  )[0];
  if (!grant) return Response.json({ error: "not_found" }, { status: 404 });

  const [favorites, details, selection] = await Promise.all([getFavorites(grantId), listFavoriteDetails(grantId), getLatestSelection(grantId)]);
  return Response.json({
    favorites,
    details: details.map((d) => ({ assetId: d.assetId, listId: d.listId, listName: d.listName, note: d.note })),
    selection: selection
      ? { items: selection.items, note: selection.note, submittedAt: selection.submittedAt.toISOString(), clientEmail: selection.clientEmail, seen: selection.seen }
      : null,
  });
}
