/* Invoice lifecycle actions (WEB-137): send | paid | void. */
import { z } from "zod";

import { getOrgContext } from "@/lib/session";
import { sendInvoice, setInvoiceStatus } from "@/lib/invoices";

export const dynamic = "force-dynamic";

const Body = z.object({ action: z.enum(["send", "paid", "void"]) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });

  if (parsed.data.action === "send") {
    const result = await sendInvoice(ctx.organizationId, id);
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 409;
      return Response.json({ error: result.error }, { status });
    }
    return Response.json({ ok: true, url: result.url });
  }
  const result = await setInvoiceStatus(ctx.organizationId, id, parsed.data.action === "paid" ? "paid" : "void");
  if (!result.ok) return Response.json({ error: result.error }, { status: 404 });
  return Response.json({ ok: true });
}
