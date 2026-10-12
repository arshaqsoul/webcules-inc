/* Store status (WEB-277, Commerce C1 6/7) — the studio-wide open/closed
 * toggle. PATCH { open } flips it; audit row lands with the actor. The UI
 * toggles optimistically and reverts to server truth on failure (that is
 * the client's job — this endpoint is idempotent source of truth). */
import { getStoreOpen, setStoreOpen } from "@/lib/commerce";
import { permissionDenied } from "@/lib/permissions";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "work.manage");
  if (denied) return denied;
  return Response.json({ open: await getStoreOpen(ctx.organizationId) });
}

export async function PATCH(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "work.manage");
  if (denied) return denied;
  let body: { open?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  if (typeof body.open !== "boolean") return Response.json({ error: "bad_request" }, { status: 400 });
  const changed = await setStoreOpen(ctx.organizationId, ctx.user.id, body.open);
  if (!changed) return Response.json({ error: "no_studio" }, { status: 404 });
  return Response.json({ open: body.open });
}
