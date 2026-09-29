/* WEB-242: per-project watermark override — inherit | on | off. Org-context
 * guarded; the effective resolver lives in lib/watermark.ts (single source). */
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  override: z.enum(["inherit", "on", "off"]),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  const updated = await getDb()
    .update(schema.projects)
    .set({
      watermarkOverride: parsed.data.override === "inherit" ? null : parsed.data.override,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.projects.id, id), eq(schema.projects.organizationId, ctx.organizationId)))
    .returning({ id: schema.projects.id });
  if (updated.length === 0) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true, override: parsed.data.override });
}
