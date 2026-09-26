/* Invoice PDF download (WEB-137) — staff session (org-scoped) or the
 * invoice's access token (?token=). Serves the R2-archived copy. */
import { getOrgContext } from "@/lib/session";
import { getInvoice, getInvoicePdf, resolveInvoiceByToken } from "@/lib/invoices";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = new URL(req.url).searchParams.get("token");

  let invoice = null;
  const ctx = await getOrgContext();
  if (ctx) invoice = await getInvoice(ctx.organizationId, id);
  if (!invoice && token) {
    const resolved = await resolveInvoiceByToken(token);
    if (resolved && resolved.id === id) invoice = resolved;
  }
  if (!invoice) return Response.json({ error: "not_found" }, { status: 404 });

  const bytes = await getInvoicePdf(invoice);
  if (!bytes) return Response.json({ error: "no_pdf" }, { status: 404 });
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="invoice-${invoice.number}.pdf"`,
    },
  });
}
