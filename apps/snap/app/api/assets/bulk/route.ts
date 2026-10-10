/* Bulk asset actions (WEB-128) — approve/reject/reset/delete/tag/untag over
 * an explicit id list, org-scoped, share-guard aware, partial-failure
 * reporting (blocked items come back with reasons). "rename" runs the
 * pattern renamer (base + running index, extensions preserved). "move"
 * (WEB-216) files the ids into a folder (folderId) or back to Unfiled
 * (folderId null) — pointer moves only, no bytes touched.
 * WEB-402: "set_edits"/"clear_edits" paste one edit set over the selection;
 * "auto_enhance" derives per-photo corrections from the upload analysis. */
import { getOrgContext } from "@/lib/session";
import { bulkAssetAction, bulkAutoEnhance, bulkRenameAssets, bulkSetEdits, bulkSetRating } from "@/lib/repos/assets";
import { moveAssets } from "@/lib/repos/folders";
import { normalizeEditSet } from "@/lib/edits";

export const dynamic = "force-dynamic";

const ACTIONS = new Set([
  "approve", "reject", "reset", "delete", "tag", "untag", "rename", "stars", "color", "move",
  "set_edits", "clear_edits", "auto_enhance",
]);

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: { action?: string; assetIds?: string[]; tag?: string; base?: string; start?: number; pad?: number; value?: number; folderId?: string | null; edits?: unknown };
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
  if (body.action === "move" && body.folderId !== null && typeof body.folderId !== "string") {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }
  const ids = body.assetIds.filter((x) => typeof x === "string").slice(0, 500);

  if (body.action === "move") {
    const result = await moveAssets({
      organizationId: ctx.organizationId,
      assetIds: ids,
      folderId: body.folderId ?? null,
      actorUserId: ctx.user.id,
    });
    return Response.json({ done: result.moved, blocked: ids.length - result.moved });
  }

  if (body.action === "stars" || body.action === "color") {
    if (!Number.isInteger(body.value) || (body.value as number) < 0 || (body.value as number) > 5) {
      return Response.json({ error: "invalid_value" }, { status: 400 });
    }
    const done = await bulkSetRating(ctx.organizationId, ids, { [body.action]: body.value });
    return Response.json({ done });
  }

  // WEB-402: paste/clear/auto — one edit set over the selection. The client
  // re-renders edited derivatives in the background after the rows land.
  if (body.action === "set_edits") {
    const normalized = normalizeEditSet(body.edits);
    if (normalized === null || Object.keys(normalized).length === 0) {
      return Response.json({ error: "invalid_edits" }, { status: 400 });
    }
    const done = await bulkSetEdits(ctx.organizationId, ids, normalized);
    return Response.json({ done });
  }
  if (body.action === "clear_edits") {
    const done = await bulkSetEdits(ctx.organizationId, ids, null);
    return Response.json({ done });
  }
  if (body.action === "auto_enhance") {
    const result = await bulkAutoEnhance(ctx.organizationId, ids);
    return Response.json(result);
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
