/* /api/studio/portfolio/site (WEB-305 core) — the portfolio site row:
 * lazy-created on first GET (draft status), updated via PATCH. Site-level
 * changes (slug, publish/unpublish, theme/home/seo) are settings.write —
 * making the org's public site live is an admin action; curation lives
 * under /collections with work.manage. */
import { permissionDenied } from "@/lib/permissions";
import { getOrgContext } from "@/lib/session";
import { getPlanEntitlements } from "@/lib/plans";
import { ensurePortfolioSite, listCollections, updatePortfolioSite } from "@/lib/repos/portfolio";
import { z } from "zod";

export const dynamic = "force-dynamic";

const siteUpdate = z.object({
  slug: z.string().trim().min(1).max(64).optional(),
  status: z.enum(["draft", "published", "unlisted"]).optional(),
  theme: z.record(z.string(), z.unknown()).optional(),
  home: z.record(z.string(), z.unknown()).optional(),
  seo: z.record(z.string(), z.unknown()).optional(),
});

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "work.manage");
  if (denied) return denied;
  const [site, collections, ent] = await Promise.all([
    ensurePortfolioSite(ctx.organizationId),
    listCollections(ctx.organizationId),
    getPlanEntitlements(ctx.organizationId),
  ]);
  return Response.json({
    site,
    collections,
    limits: {
      maxCollections: ent?.maxPortfolioCollections ?? null,
      maxItems: ent?.maxPortfolioItems ?? null,
    },
  });
}

export async function PATCH(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "settings.write");
  if (denied) return denied;
  let body: z.infer<typeof siteUpdate>;
  try {
    body = siteUpdate.parse(await req.json());
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const result = await updatePortfolioSite(ctx.organizationId, body);
  if (!result.ok) {
    const status =
      result.error === "not_found" ? 404 : result.error === "empty_site" ? 409 : 400;
    return Response.json({ error: result.error }, { status });
  }
  return Response.json({ site: result.site });
}
