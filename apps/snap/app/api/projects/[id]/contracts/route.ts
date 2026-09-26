/* Contract create + list + lifecycle (WEB-158, staff side). */
import { z } from "zod";

import { getOrgContext } from "@/lib/session";
import { createContract, listProjectContracts, sendContract, voidContract } from "@/lib/contracts";

export const dynamic = "force-dynamic";

const CreateBody = z.object({
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(20).max(30_000),
  clientEmail: z.string().trim().email().nullable().optional(),
});
const ActionBody = z.object({ contractId: z.string().uuid(), action: z.enum(["send", "void"]) });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  return Response.json({ contracts: await listProjectContracts(ctx.organizationId, id) });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (raw.contractId) {
    const parsed = ActionBody.safeParse(raw);
    if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
    if (parsed.data.action === "send") {
      const result = await sendContract(ctx.organizationId, parsed.data.contractId);
      if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
      return Response.json({ ok: true, url: result.url });
    }
    const result = await voidContract(ctx.organizationId, parsed.data.contractId);
    if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
    return Response.json({ ok: true });
  }

  const parsed = CreateBody.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const contract = await createContract({
    organizationId: ctx.organizationId,
    projectId: id,
    title: parsed.data.title,
    body: parsed.data.body,
    clientEmail: parsed.data.clientEmail ?? null,
  });
  return Response.json({ ok: true, contract });
}
