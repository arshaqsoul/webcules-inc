/* Grant lifecycle — expiry edit (PATCH). Revocation/regeneration live in
 * their own action routes. */
import { eq, and } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";
import { getShareGrant, normalizeExpiry, setShareGrantExpiry } from "@/lib/shares/grants";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  let body: { expiresInDays?: number | null; proofing?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  // WEB-242: proofing toggle (independent of the expiry edit).
  if (typeof body.proofing === "boolean") {
    const updated = await getDb()
      .update(schema.shareGrants)
      .set({ proofing: body.proofing })
      .where(and(eq(schema.shareGrants.id, id), eq(schema.shareGrants.organizationId, ctx.organizationId)))
      .returning({ id: schema.shareGrants.id });
    if (updated.length === 0) return Response.json({ error: "not_found" }, { status: 404 });
    if (body.expiresInDays === undefined) return Response.json({ ok: true });
  }

  const expiry = normalizeExpiry(body.expiresInDays ?? null);
  if (!expiry.ok) return Response.json({ error: "invalid_expiry" }, { status: 400 });

  const result = await setShareGrantExpiry({
    organizationId: ctx.organizationId,
    grantId: id,
    expiresAt: expiry.expiresAt,
    actorUserId: ctx.user.id,
  });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.error === "not_found" ? 404 : 409 });
  }
  return Response.json({ ok: true });
}
