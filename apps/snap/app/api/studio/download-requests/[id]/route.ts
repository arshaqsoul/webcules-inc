/* /api/studio/download-requests/{id} (WEB-261) — the approvals hub action
 * surface (Studio+ gate lives on enabling the toggle; deciding requests is
 * open to any tier that has one, e.g. after a downgrade). */
import { z } from "zod";

import { getOrgContext } from "@/lib/session";
import { decideDownloadRequest } from "@/lib/repos/downloads";
import { sendDownloadApprovedEmail } from "@/lib/repos/downloads-notify";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().max(500).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  const result = await decideDownloadRequest({
    organizationId: ctx.organizationId,
    id,
    decision: parsed.data.action,
    note: parsed.data.note ?? null,
    actorUserId: ctx.user.id,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.error === "not_found" ? 404 : 409 });
  if (parsed.data.action === "approve") {
    // Tell the client it is ready to pull; a mail failure never undoes the approval.
    await sendDownloadApprovedEmail(id).catch((err) => console.error("download approved email failed:", String(err)));
  }
  return Response.json({ ok: true });
}
