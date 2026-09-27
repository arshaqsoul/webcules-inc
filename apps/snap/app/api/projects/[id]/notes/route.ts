/* Edit the private project notes (WEB-115). */
import { z } from "zod";

import { setProjectNotes } from "@/lib/repos/projects";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

const schema = z.object({
  notes: z.string().max(8000),
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
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });

  const res = await setProjectNotes({
    organizationId: ctx.organizationId,
    projectId: id,
    notes: parsed.data.notes,
    actorUserId: ctx.user.id,
  });
  if (!res.ok) return Response.json({ error: res.error }, { status: 404 });
  return Response.json({ ok: true });
}
