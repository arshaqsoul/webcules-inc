/* Project status transition (org-context guarded, validated state machine). */
import { z } from "zod";

import { PROJECT_STATUSES, transitionProject } from "@/lib/repos/projects";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  toStatus: z.enum(PROJECT_STATUSES),
  note: z.string().trim().max(500).optional(),
  newEventDate: z.string().datetime().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await transitionProject({
    organizationId: ctx.organizationId,
    projectId: id,
    toStatus: body.toStatus,
    actorUserId: ctx.user.id,
    note: body.note,
    newEventDate: body.newEventDate ? new Date(body.newEventDate) : undefined,
  });
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : result.error === "invalid_json" ? 400 : 409;
    return Response.json({ error: result.error }, { status });
  }
  return Response.json({ ok: true });
}
