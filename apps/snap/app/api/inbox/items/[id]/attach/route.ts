/* Attach a triage item to a record (WEB-308) — the one-click resolution for
 * unmatched inbound: pick a client/lead/project, the item joins (or starts)
 * that conversation and the thread opens. */
import { z } from "zod";

import { getOrgContext } from "@/lib/session";
import { attachTriageItem } from "@/lib/repos/inbox";

export const dynamic = "force-dynamic";

const attachSchema = z.object({
  attach: z.literal(true),
  kind: z.enum(["lead", "client", "project"]),
  recordId: z.string().min(1),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = attachSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_input" }, { status: 400 });

  const { id } = await params;
  const out = await attachTriageItem({
    userId: ctx.user.id,
    organizationId: ctx.organizationId,
    itemId: id,
    kind: parsed.data.kind,
    recordId: parsed.data.recordId,
  });
  if (!out.ok) return Response.json({ error: out.error }, { status: out.error === "record_not_found" ? 404 : 409 });

  return Response.json({ ok: true, threadId: out.threadId, title: out.title });
}
