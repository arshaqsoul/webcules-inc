/* Bulk inbox actions (WEB-304) — mark-all-read and delete-all-read, scoped
 * to the caller's user + active org. */
import { z } from "zod";

import { getOrgContext } from "@/lib/session";
import { deleteReadInboxItems, markAllInboxRead } from "@/lib/repos/inbox";

export const dynamic = "force-dynamic";

const bulkSchema = z.object({
  action: z.union([z.literal("mark-all-read"), z.literal("delete-read")]),
});

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_input" }, { status: 400 });

  const scope = { userId: ctx.user.id, organizationId: ctx.organizationId };
  const affected =
    parsed.data.action === "mark-all-read" ? await markAllInboxRead(scope) : await deleteReadInboxItems(scope);
  return Response.json({ ok: true, affected });
}
