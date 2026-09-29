/* /api/grants/{id}/favorites/export (WEB-264) — the studio's favorites
 * export. CSV now (request-path — tiny); "as ZIP" routes through the async
 * download_request flow (scope=photos with the resolved ids — cron builds
 * it like any other). Studio+ gate per WEB-267. */
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";
import { getPlanEntitlements } from "@/lib/plans";
import { listFavoriteDetails } from "@/lib/shares/selections";
import { createDownloadRequest } from "@/lib/repos/downloads";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  zip: z.boolean().optional(),
  listId: z.string().optional(),
  sizePref: z.enum(["full", "web"]).optional(),
});

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const grant = (
    await getDb()
      .select()
      .from(schema.shareGrants)
      .where(and(eq(schema.shareGrants.id, id), eq(schema.shareGrants.organizationId, ctx.organizationId)))
      .limit(1)
  )[0];
  if (!grant) return Response.json({ error: "not_found" }, { status: 404 });

  const ent = await getPlanEntitlements(ctx.organizationId);
  if (ent?.id !== "studio" && ent?.id !== "pro") {
    return Response.json({ error: "exports_require_studio" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  const details = (await listFavoriteDetails(grant.id)).filter((d) => !parsed.data?.listId || d.listId === parsed.data.listId);
  if (!details.length) return Response.json({ error: "empty" }, { status: 400 });

  const assetRows = await getDb()
    .select({ id: schema.assets.id, filename: schema.assets.filename })
    .from(schema.assets)
    .where(inArray(schema.assets.id, details.map((d) => d.assetId)));
  const nameOf = new Map(assetRows.map((a) => [a.id, a.filename]));

  if (parsed.data?.zip) {
    // Async ZIP through the standard pipeline — cron builds it, the client
    // (this grant's email = the studio's client) gets the ready email.
    const result = await createDownloadRequest({
      grant,
      clientEmail: grant.clientEmail,
      scope: "photos",
      assetIds: details.map((d) => d.assetId),
      sizePref: parsed.data.sizePref === "web" ? "web" : "full",
      approvalRequired: false,
    });
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
    return Response.json({ zip: true, requestId: result.request.id, fileCount: result.request.fileCount });
  }

  const header = "filename,list,note,client,favorited_at";
  const rows = details.map((d) =>
    [
      csvCell(nameOf.get(d.assetId) ?? d.assetId),
      csvCell(d.listName),
      csvCell(d.note ?? ""),
      csvCell(grant.clientEmail),
      csvCell(d.createdAt.toISOString()),
    ].join(","),
  );
  return new Response([header, ...rows].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="favorites.csv"`,
    },
  });
}
