/* /api/grants/{id}/selection-seen (WEB-264) — mark the grant's latest
 * selection as seen/done so stale selections stay obvious in the studio. */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";
import { markSelectionSeen } from "@/lib/shares/selections";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const owned = (
    await getDb()
      .select({ id: schema.shareGrants.id })
      .from(schema.shareGrants)
      .where(and(eq(schema.shareGrants.id, id), eq(schema.shareGrants.organizationId, ctx.organizationId)))
      .limit(1)
  )[0];
  if (!owned) return Response.json({ error: "not_found" }, { status: 404 });
  const ok = await markSelectionSeen(ctx.organizationId, id);
  if (!ok) return Response.json({ error: "no_selection" }, { status: 404 });
  return Response.json({ ok: true });
}
