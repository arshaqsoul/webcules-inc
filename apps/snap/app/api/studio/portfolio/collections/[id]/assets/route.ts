/* /api/studio/portfolio/collections/[id]/assets (WEB-305 core) — the
 * curation items: list, add, remove, per-item meta, reorder. Every add
 * re-validates org ownership + image kind in the repo (public collections
 * serve web-size image derivatives only) and enforces the org-wide
 * maxPortfolioItems cap (Free 20 / Lite 250 / Studio+ ∞, WEB-302 §4). */
import { permissionDenied } from "@/lib/permissions";
import { getOrgContext } from "@/lib/session";
import { getPlanEntitlements } from "@/lib/plans";
import {
  addAssetsToCollection,
  listCollectionAssets,
  removeAssetFromCollection,
  reorderCollectionAssets,
  updateCollectionAsset,
} from "@/lib/repos/portfolio";
import { z } from "zod";

export const dynamic = "force-dynamic";

const addBody = z.object({ assetIds: z.array(z.string().min(1)).min(1).max(500) });
const metaBody = z.object({
  assetId: z.string().min(1),
  caption: z.string().trim().max(300).optional().nullable(),
  altText: z.string().trim().max(300).optional().nullable(),
  displayCrop: z.record(z.string(), z.unknown()).optional().nullable(),
});
const reorderBody = z.object({ orderedAssetIds: z.array(z.string().min(1)).min(1) });
const removeBody = z.object({ assetId: z.string().min(1) });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "work.manage");
  if (denied) return denied;
  const { id } = await params;
  return Response.json({ items: await listCollectionAssets(ctx.organizationId, id) });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "work.manage");
  if (denied) return denied;
  const { id } = await params;
  let body: z.infer<typeof addBody>;
  try {
    body = addBody.parse(await req.json());
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const ent = await getPlanEntitlements(ctx.organizationId);
  const result = await addAssetsToCollection(
    ctx.organizationId,
    id,
    body.assetIds,
    ent?.maxPortfolioItems ?? null,
  );
  if (!result.ok) {
    const status =
      result.error === "limit_reached"
        ? 403
        : result.error === "not_found"
          ? 404
          : result.error === "not_owned" || result.error === "not_image"
            ? 403
            : 400;
    return Response.json(
      {
        error: result.error,
        ...(result.rejected ? { rejected: result.rejected } : {}),
        ...(result.error === "limit_reached" ? { limit: ent?.maxPortfolioItems ?? null } : {}),
      },
      { status },
    );
  }
  return Response.json({ added: result.added });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "work.manage");
  if (denied) return denied;
  const { id } = await params;
  let body: z.infer<typeof metaBody> | z.infer<typeof reorderBody>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if ("orderedAssetIds" in body) {
    const parsed = reorderBody.safeParse(body);
    if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
    const result = await reorderCollectionAssets(ctx.organizationId, id, parsed.data.orderedAssetIds);
    if (!result.ok) {
      return Response.json(
        { error: result.error },
        { status: result.error === "not_found" ? 404 : 400 },
      );
    }
    return Response.json({ ok: true });
  }
  const parsed = metaBody.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  const { assetId, ...meta } = parsed.data;
  const result = await updateCollectionAsset(ctx.organizationId, id, assetId, meta);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.error === "not_found" ? 404 : 400 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "work.manage");
  if (denied) return denied;
  const { id } = await params;
  let assetId = new URL(req.url).searchParams.get("assetId");
  if (!assetId) {
    try {
      const body = removeBody.parse(await req.json());
      assetId = body.assetId;
    } catch {
      return Response.json({ error: "invalid_body" }, { status: 400 });
    }
  }
  if (!assetId) return Response.json({ error: "invalid_body" }, { status: 400 });
  const ok = await removeAssetFromCollection(ctx.organizationId, id, assetId);
  if (!ok) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}
