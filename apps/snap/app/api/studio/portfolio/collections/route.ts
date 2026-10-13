/* /api/studio/portfolio/collections (WEB-305 core) — curation CRUD.
 * work.manage: curation is day-to-day work (like galleries). The tier cap
 * (maxPortfolioCollections — Free 1 / Lite 5 / Studio+ ∞, WEB-302 §4) is
 * enforced in the repo, passed from live entitlements here. */
import { permissionDenied } from "@/lib/permissions";
import { getOrgContext } from "@/lib/session";
import { getPlanEntitlements } from "@/lib/plans";
import { createCollection, listCollections } from "@/lib/repos/portfolio";
import { z } from "zod";

export const dynamic = "force-dynamic";

const collectionInput = z.object({
  title: z.string().trim().min(1).max(80),
  subtitle: z.string().trim().max(160).optional().nullable(),
  coverAssetId: z.string().optional().nullable(),
  visibility: z.enum(["public", "unlisted"]).optional(),
});

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "work.manage");
  if (denied) return denied;
  const [collections, ent] = await Promise.all([
    listCollections(ctx.organizationId),
    getPlanEntitlements(ctx.organizationId),
  ]);
  return Response.json({
    collections,
    limits: {
      maxCollections: ent?.maxPortfolioCollections ?? null,
      maxItems: ent?.maxPortfolioItems ?? null,
    },
  });
}

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "work.manage");
  if (denied) return denied;
  let body: z.infer<typeof collectionInput>;
  try {
    body = collectionInput.parse(await req.json());
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const ent = await getPlanEntitlements(ctx.organizationId);
  const result = await createCollection(
    ctx.organizationId,
    body,
    ent?.maxPortfolioCollections ?? null,
  );
  if (!result.ok) {
    const status = result.error === "limit_reached" ? 403 : 400;
    return Response.json(
      {
        error: result.error,
        ...(result.error === "limit_reached"
          ? { limit: ent?.maxPortfolioCollections ?? null }
          : {}),
      },
      { status },
    );
  }
  return Response.json({ id: result.collection.id, collection: result.collection }, { status: 201 });
}
