/* POST /api/inbox/threads/[id]/client - connect a real client to a
 * conversation that has no client email (WEB-335). Replaces the old
 * unknown@ stand-in recipient: the composer asks for a client instead. */
import { z } from "zod";

import { getOrgContext } from "@/lib/session";
import { linkClientToPlaceholderThread } from "@/lib/repos/inbox";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().max(120).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_email" }, { status: 400 });

  const out = await linkClientToPlaceholderThread({
    organizationId: ctx.organizationId,
    threadId: id,
    email: parsed.data.email,
    name: parsed.data.name,
  });
  if (!out.ok) return Response.json({ error: out.error }, { status: out.error === "not_found" ? 404 : 409 });
  return Response.json({ ok: true, threadId: out.threadId });
}
