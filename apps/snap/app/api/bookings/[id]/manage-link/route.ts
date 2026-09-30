/* Manage-link control for one booking (WEB-272) — revoke kills the client's
 * /booking/{token} page + APIs immediately; reissue mints a fresh token (the
 * old link dies with the replaced hash) and returns the URL to copy into an
 * email or chat. */
import { z } from "zod";

import { reissueManageToken, revokeManageToken } from "@/lib/repos/booking-manage";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ action: z.enum(["revoke", "reissue"]) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }

  if (body.action === "revoke") {
    const result = await revokeManageToken({
      organizationId: ctx.organizationId,
      bookingId: id,
      byUserId: ctx.user.id,
    });
    if (!result.ok) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ ok: true, manageLink: "revoked" });
  }

  const result = await reissueManageToken({
    organizationId: ctx.organizationId,
    bookingId: id,
    byUserId: ctx.user.id,
  });
  if (!result.ok) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({
    ok: true,
    manageLink: "active",
    url: `${new URL(req.url).origin}/booking/${result.token}`,
  });
}
