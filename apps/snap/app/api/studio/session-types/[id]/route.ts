/* /api/studio/session-types/{id} (WEB-250) — update / delete / reorder. */
import { permissionDenied } from "@/lib/permissions";
import { z } from "zod";

import { getOrgContext } from "@/lib/session";
import { studioCanTakePayments } from "@/lib/connect";
import { deleteSessionType, listSessionTypes, reorderSessionTypes, updateSessionType } from "@/lib/repos/session-types";
import { sessionTypeInput } from "../route";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "settings.write");
  if (denied) return denied;
  const { id } = await params;
  let body: z.infer<typeof sessionTypeInput>;
  try {
    body = sessionTypeInput.parse(await req.json());
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  // WEB-352: switching a type to take payment needs a connected Stripe account
  // (types already set up keep saving other edits).
  if ((body.depositKind === "deposit" || body.depositKind === "full") && !(await studioCanTakePayments(ctx.organizationId))) {
    const current = (await listSessionTypes(ctx.organizationId, { includeInactive: true })).find((t) => t.id === id);
    if (current && current.depositKind !== body.depositKind) return Response.json({ error: "connect_required" }, { status: 409 });
  }
  const result = await updateSessionType(ctx.organizationId, id, body);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.error === "not_found" ? 404 : 400 });
  return Response.json({ ok: true });
}

export async function POST(req: Request, { params }: Params) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "settings.write");
  if (denied) return denied;
  const { id } = await params;
  let body: { action?: string; orderedIds?: string[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (body.action === "reorder" && Array.isArray(body.orderedIds)) {
    await reorderSessionTypes(ctx.organizationId, body.orderedIds);
    return Response.json({ ok: true });
  }
  return Response.json({ error: "invalid_action" }, { status: 400 });
}

export async function DELETE(_req: Request, { params }: Params) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "settings.write");
  if (denied) return denied;
  const { id } = await params;
  const result = await deleteSessionType(ctx.organizationId, id);
  if (!result.ok) return Response.json({ error: result.error }, { status: 404 });
  return Response.json({ ok: true });
}
