/* The bulk markup tool (WEB-179, Commerce C1 2/7) — POST { variantIds,
 * markupPct, rounding } applies a markup percentage to the selected
 * variants; { preview: true } returns what each price would become without
 * writing. Rounding presets live in @webcules/commerce (roundPricePreset);
 * zero-cost variants are skipped and reported. */
import { applyBulkMarkup, commerceErrorStatus, previewBulkMarkup } from "@/lib/commerce";
import { isMarkupRounding } from "@webcules/commerce";
import type { MarkupRounding } from "@webcules/commerce";
import { permissionDenied } from "@/lib/permissions";
import { getOrgContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "work.manage");
  if (denied) return denied;
  let body: { variantIds?: unknown; markupPct?: unknown; rounding?: unknown; preview?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  if (
    !Array.isArray(body.variantIds) ||
    body.variantIds.some((v) => typeof v !== "string") ||
    typeof body.markupPct !== "number" ||
    !Number.isFinite(body.markupPct) ||
    body.markupPct < 0 ||
    typeof body.rounding !== "string" ||
    !isMarkupRounding(body.rounding)
  ) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const input = {
    variantIds: body.variantIds as string[],
    markupPct: body.markupPct,
    rounding: body.rounding as MarkupRounding,
  };
  if (body.preview === true) {
    const res = await previewBulkMarkup(ctx.organizationId, input);
    if (!res.ok) return Response.json({ error: res.error }, { status: commerceErrorStatus(res.error) });
    return Response.json({ variants: res.value });
  }
  const res = await applyBulkMarkup(ctx.organizationId, input);
  if (!res.ok) return Response.json({ error: res.error }, { status: commerceErrorStatus(res.error) });
  return Response.json(res.value);
}
