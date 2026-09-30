/* POST /api/studio/import/[batchId]/undo — WEB-276: roll back a batch
 * within 7 days. Only rows the batch created AND nothing has used since
 * are removed (converted leads and project-linked clients stay). */
import { getOrgContext } from "@/lib/session";
import { permissionDenied } from "@/lib/permissions";
import { undoImport } from "@/lib/repos/import";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "work.manage");
  if (denied) return denied;
  const { batchId } = await params;

  const res = await undoImport(ctx.organizationId, batchId);
  if (!res.ok) {
    return Response.json({ error: res.error }, { status: res.error === "not_found" ? 404 : 409 });
  }
  return Response.json(res);
}
