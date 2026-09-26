/* Create a draft invoice for a project (WEB-137). */
import { z } from "zod";

import { getOrgContext } from "@/lib/session";
import { createInvoice, listProjectInvoices } from "@/lib/invoices";

export const dynamic = "force-dynamic";

const Line = z.object({
  description: z.string().trim().min(1).max(200),
  qty: z.number().int().min(1).max(100).default(1),
  amountMinor: z.number().int().min(0).max(1_000_000_00),
});
const Body = z.object({
  lines: z.array(Line).min(1).max(30),
  dueAt: z.string().datetime().nullable().optional(),
  clientEmail: z.string().trim().email().nullable().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  return Response.json({ invoices: await listProjectInvoices(ctx.organizationId, id) });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });

  try {
    const invoice = await createInvoice({
      organizationId: ctx.organizationId,
      projectId: id,
      lines: parsed.data.lines,
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
      clientEmail: parsed.data.clientEmail ?? null,
    });
    return Response.json({ ok: true, invoice });
  } catch {
    return Response.json({ error: "creation_failed" }, { status: 500 });
  }
}
