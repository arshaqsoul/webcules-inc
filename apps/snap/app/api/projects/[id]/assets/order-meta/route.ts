/* /api/projects/{id}/assets/order-meta - the facts the date-taken and color
 * sorts need for photos uploaded before they existed.
 *   { scan: true }               read EXIF capture dates server-side (bounded batch)
 *   { colors: [{ id, key }] }    store colors the browser computed from thumbnails */
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";
import { backfillCapturedAt, saveColorKeys } from "@/lib/repos/gallery-order";
import { inArray, isNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

const bodySchema = z.union([
  z.object({ scan: z.literal(true) }),
  z.object({ colors: z.array(z.object({ id: z.string().uuid(), key: z.number().int() })).min(1).max(500) }),
]);

async function projectOf(organizationId: string, id: string) {
  return (
    await getDb()
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, id), eq(schema.projects.organizationId, organizationId)))
      .limit(1)
  )[0];
}

/** GET - ids of the project's deliverable photos that still need a color key. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await projectOf(ctx.organizationId, id))) return Response.json({ error: "not_found" }, { status: 404 });
  const rows = await getDb()
    .select({ id: schema.assets.id })
    .from(schema.assets)
    .where(
      and(
        eq(schema.assets.organizationId, ctx.organizationId),
        eq(schema.assets.projectId, id),
        isNull(schema.assets.colorKey),
        inArray(schema.assets.kind, ["image", "video"]),
        inArray(schema.assets.status, ["approved", "shared"]),
      ),
    );
  return Response.json({ missingColor: rows.map((r) => r.id) });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  if (!(await projectOf(ctx.organizationId, id))) return Response.json({ error: "not_found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  if ("scan" in parsed.data) {
    return Response.json({ ok: true, ...(await backfillCapturedAt(ctx.organizationId, id)) });
  }
  return Response.json({ ok: true, saved: await saveColorKeys(ctx.organizationId, parsed.data.colors) });
}
