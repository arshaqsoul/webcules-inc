/* Bulk asset actions (WEB-128) — approve/reject/reset/delete/tag/untag over
 * an explicit id list, org-scoped, share-guard aware, partial-failure
 * reporting (blocked items come back with reasons). */
import { getOrgContext } from "@/lib/session";
import { bulkAssetAction } from "@/lib/repos/assets";

export const dynamic = "force-dynamic";

const ACTIONS = new Set(["approve", "reject", "reset", "delete", "tag", "untag"]);

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: { action?: string; assetIds?: string[]; tag?: string };
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

  const result = await bulkAssetAction(ctx.organizationId, {
    action: body.action as "approve" | "reject" | "reset" | "delete" | "tag" | "untag",
    assetIds: ids,
    tag: body.tag,
    actorUserId: ctx.user.id,
  });
  return Response.json(result);
}
