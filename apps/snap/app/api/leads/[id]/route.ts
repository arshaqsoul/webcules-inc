/* Lead status updates (archive/reopen) + conversion to project + client. */
import { z } from "zod";

import { convertLeadToProject, updateLeadStatus, LEAD_STATUSES } from "@/lib/repos/leads";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

const statusSchema = z.object({
  status: z.enum(LEAD_STATUSES),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  await updateLeadStatus(ctx.organizationId, id, parsed.data.status);
  return Response.json({ ok: true });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  let title: string | undefined;
  try {
    const body = (await req.json()) as { title?: string };
    title = body.title;
  } catch {
    title = undefined;
  }

  try {
    const result = await convertLeadToProject({
      organizationId: ctx.organizationId,
      leadId: id,
      actorUserId: ctx.user.id,
      title,
    });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const message = String(err instanceof Error ? err.message : err);
    return Response.json(
      { error: message.includes("not found") ? "not_found" : "conversion_failed" },
      { status: message.includes("not found") ? 404 : 500 },
    );
  }
}
