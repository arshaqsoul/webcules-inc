/* Set the event date on an undated project (WEB-167) — re-arms the
 * auto-advance cron for projects converted from leads without a date. */
import { z } from "zod";

import { setProjectEventDate } from "@/lib/repos/projects";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

const schema = z.object({
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
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

  const res = await setProjectEventDate({
    organizationId: ctx.organizationId,
    projectId: id,
    eventDate: new Date(`${parsed.data.eventDate}T12:00:00Z`),
    actorUserId: ctx.user.id,
  });
  if (!res.ok) return Response.json({ error: res.error }, { status: 404 });
  return Response.json({ ok: true });
}
