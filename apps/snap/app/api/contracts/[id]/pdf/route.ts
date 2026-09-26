/* Signed-contract PDF (WEB-158) — staff session (org-scoped) or the
 * contract's access token (?token=). */
import { getOrgContext } from "@/lib/session";
import { getContract, getContractPdf, resolveContractByToken } from "@/lib/contracts";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = new URL(req.url).searchParams.get("token");

  let contract = null;
  const ctx = await getOrgContext();
  if (ctx) contract = await getContract(ctx.organizationId, id);
  if (!contract && token) {
    const resolved = await resolveContractByToken(token);
    if (resolved && resolved.id === id) contract = resolved;
  }
  if (!contract) return Response.json({ error: "not_found" }, { status: 404 });
  const bytes = await getContractPdf(contract);
  if (!bytes) return Response.json({ error: "no_pdf" }, { status: 404 });
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${contract.title.replace(/[^\w.-]+/g, "_")}-signed.pdf"`,
    },
  });
}
