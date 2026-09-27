/* Bulk asset actions (WEB-128) — approve/reject/reset/delete/tag/untag over
 * an explicit id list, org-scoped, share-guard aware, partial-failure
 * reporting (blocked items come back with reasons). "rename" runs the
 * pattern renamer (base + running index, extensions preserved). */
import { getOrgContext } from "@/lib/session";
import { bulkAssetAction, bulkRenameAssets, bulkSetRating } from "@/lib/repos/assets";

export const dynamic = "force-dynamic";

const ACTIONS = new Set(["approve", "reject", "reset", "delete", "tag", "untag", "rename", "stars", "color"]);

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: { action?: string; assetIds?: string[]; tag?: string; base?: string; start?: number; pad?: number; value?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.action || !ACTIONS.has(body.action) || !Array.isArray(body.assetIds) || !body.assetIds.length) {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }
  if ((body.action === "tag" || body.action === "untag") && !body.tag?.trim()) {
    return Response.json({ error: "tag_required" }, { status: 400 });
  }
  const ids = body.assetIds.filter((x) => typeof x === "string").slice(0, 500);

  if (body.action === "stars" || body.action === "color") {
    if (!Number.isInteger(body.value) || (body.value as number) < 0 || (body.value as number) > 5) {
      return Response.json({ error: "invalid_value" }, { status: 400 });
    }
    const done = await bulkSetRating(ctx.organizationId, ids, { [body.action]: body.value });
    return Response.json({ done });
  }

  if (body.action === "rename") {
    const base = (body.base ?? "").trim().replace(/[\\/:*?"<>|]/g, "-");
    const start = Math.max(0, Math.min(999_999, Math.trunc(body.start ?? 1)));
    const pad = Math.max(1, Math.min(5, Math.trunc(body.pad ?? 2)));
    if (!base || base.length > 80) return Response.json({ error: "invalid_base" }, { status: 400 });
    const result = await bulkRenameAssets({
      organizationId: ctx.organizationId,
      assetIds: ids,
      base,
      start,
      pad,
      actorUserId: ctx.user.id,
    });
    return Response.json(result);
  }

  const result = await bulkAssetAction(ctx.organizationId, {
    action: body.action as "approve" | "reject" | "reset" | "delete" | "tag" | "untag",
    assetIds: ids,
    tag: body.tag,
    actorUserId: ctx.user.id,
  });
  return Response.json(result);
}
