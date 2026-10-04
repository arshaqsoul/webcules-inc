/* /api/grants/{id}/favorites/export (WEB-264) — the studio's favorites
 * export. POST returns the CSV, or (zip:true) a manifest of the streamed
 * ZIP parts; GET ?part=N streams one part straight from R2 (same engine as
 * the client's download-all - nothing is built ahead or emailed).
 * Studio+ gate per WEB-267. */
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";
import { getPlanEntitlements } from "@/lib/plans";
import { listFavoriteDetails } from "@/lib/shares/selections";
import { buildZipPlan, manifestOf, zipPartResponse } from "@/lib/zip-delivery";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  zip: z.boolean().optional(),
  listId: z.string().optional(),
  sizePref: z.enum(["full", "web"]).optional(),
});

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

type GrantRow = typeof schema.shareGrants.$inferSelect;

function zipPlanFor(grant: GrantRow, assetIds: string[], size: "full" | "web") {
  return buildZipPlan({
    organizationId: grant.organizationId,
    grantId: grant.id,
    // The studio exports its own gallery's photos; proofing watermarks protect the client view only.
    proofing: false,
    selection: { scope: "photos", assetIds, size },
  });
}

async function loadStudioGrant(id: string) {
  const ctx = await getOrgContext();
  if (!ctx) return { error: Response.json({ error: "unauthorized" }, { status: 401 }) } as const;
  const grant = (
    await getDb()
      .select()
      .from(schema.shareGrants)
      .where(and(eq(schema.shareGrants.id, id), eq(schema.shareGrants.organizationId, ctx.organizationId)))
      .limit(1)
  )[0];
  if (!grant) return { error: Response.json({ error: "not_found" }, { status: 404 }) } as const;
  const ent = await getPlanEntitlements(ctx.organizationId);
  if (ent?.id !== "studio" && ent?.id !== "pro") {
    return { error: Response.json({ error: "exports_require_studio" }, { status: 403 }) } as const;
  }
  return { grant } as const;
}

/** GET ?size=web&listId=&part=N[&v=] - one streamed ZIP part of the favorites. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadStudioGrant(id);
  if ("error" in loaded) return loaded.error;
  const url = new URL(req.url);
  const listId = url.searchParams.get("listId");
  const details = (await listFavoriteDetails(loaded.grant.id)).filter((d) => !listId || d.listId === listId);
  const plan = await zipPlanFor(loaded.grant, details.map((d) => d.assetId), url.searchParams.get("size") === "web" ? "web" : "full");
  const part = Number(url.searchParams.get("part") ?? 1);
  if (!plan.items.length || !Number.isInteger(part)) return Response.json({ error: "empty" }, { status: 400 });
  const seen = url.searchParams.get("v");
  if (seen && seen !== plan.revision) return Response.json({ error: "gallery_changed" }, { status: 409 });
  return zipPartResponse(plan, part, { label: "Favorites" });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadStudioGrant(id);
  if ("error" in loaded) return loaded.error;
  const grant = loaded.grant;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  const details = (await listFavoriteDetails(grant.id)).filter((d) => !parsed.data?.listId || d.listId === parsed.data.listId);
  if (!details.length) return Response.json({ error: "empty" }, { status: 400 });

  const assetRows = await getDb()
    .select({ id: schema.assets.id, filename: schema.assets.filename })
    .from(schema.assets)
    .where(inArray(schema.assets.id, details.map((d) => d.assetId)));
  const nameOf = new Map(assetRows.map((a) => [a.id, a.filename]));

  if (parsed.data?.zip) {
    const plan = await zipPlanFor(grant, details.map((d) => d.assetId), parsed.data.sizePref === "web" ? "web" : "full");
    if (!plan.items.length) return Response.json({ error: "empty" }, { status: 400 });
    return Response.json({ zip: true, fileCount: plan.items.length, ...manifestOf(plan) });
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
