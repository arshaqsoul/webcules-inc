/* POST /api/studio/templates/restore-starters (WEB-255) — re-seed missing
 * starter templates only; existing rows are never touched. */
import { getOrgContext } from "@/lib/session";
import { restoreMissingStarters } from "@/lib/repos/templates";

export const dynamic = "force-dynamic";

export async function POST() {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const added = await restoreMissingStarters(ctx.organizationId);
  return Response.json({ ok: true, added });
}
