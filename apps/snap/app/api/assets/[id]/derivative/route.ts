/* Derivative upload (WEB-116) — the browser generates thumb/preview images
 * via canvas right after an upload completes and pushes them here. Small
 * (≤8MB) image-only payloads; the originals are never modified.
 * WEB-401: the preview upload also carries the cull-assist analysis
 * (phash + quality scores) computed in the same decode pass.
 * WEB-402: kind "edited" is the browser-rendered look (edit.jpg) — always
 * replaceable, every save re-renders. */
import { attachDerivative } from "@/lib/repos/assets";
import { getPlanEntitlements } from "@/lib/plans";
import { getStudioProfile } from "@/lib/repos/studios";
import { getOrgContext } from "@/lib/session";
import { parseAnalysis, isValidPhash } from "@/lib/image-analysis";

export const dynamic = "force-dynamic";

const MAX_DERIVATIVE_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "expected_multipart" }, { status: 400 });
  }
  const kind = form.get("kind");
  if (kind !== "thumb" && kind !== "preview" && kind !== "preview_wm" && kind !== "edited") {
    return Response.json({ error: "invalid_kind" }, { status: 400 });
  }
  // WEB-242: preview_wm exists only for entitled studios (margin + abuse).
  if (kind === "preview_wm") {
    const ent = await getPlanEntitlements(ctx.organizationId);
    if (!ent?.whiteLabel) return Response.json({ error: "plan_required" }, { status: 403 });
  }
  const replace = form.get("replace") === "1" || kind === "edited";
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "missing_file" }, { status: 400 });
  if (file.size > MAX_DERIVATIVE_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
  if (!file.type.startsWith("image/")) return Response.json({ error: "unsupported_type" }, { status: 400 });

  // WEB-260: intrinsic size + video duration from the uploader's decoder
  // (set-if-null server-side; sane bounds only).
  const intField = (name: string): number | undefined => {
    const n = Number(form.get(name));
    return Number.isFinite(n) && n > 0 && n < 100_000 ? Math.round(n) : undefined;
  };
  const width = intField("width");
  const height = intField("height");
  const durationMsRaw = Number(form.get("durationMs"));
  const durationMs = Number.isFinite(durationMsRaw) && durationMsRaw > 0 && durationMsRaw < 24 * 3600_000 ? Math.round(durationMsRaw) : undefined;

  const colorRaw = Number(form.get("colorKey"));
  const colorKey = form.get("colorKey") !== null && Number.isInteger(colorRaw) ? colorRaw : undefined;

  // WEB-401: cull-assist payload rides the preview derivative (the one
  // upload every image gets). Invalid values are dropped, never rejected —
  // analysis is enhancement, not a gate.
  const phashRaw = form.get("phash");
  const phash = typeof phashRaw === "string" && isValidPhash(phashRaw) ? phashRaw : undefined;
  const analysisRaw = form.get("analysis");
  const analysis = typeof analysisRaw === "string" ? parseAnalysis(analysisRaw) : null;

  const result = await attachDerivative({
    organizationId: ctx.organizationId,
    assetId: id,
    kind,
    bytes: await file.arrayBuffer(),
    contentType: file.type,
    replace,
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
    ...(durationMs ? { durationMs } : {}),
    ...(colorKey !== undefined ? { colorKey } : {}),
    ...(phash ? { phash } : {}),
    ...(analysis ? { analysis } : {}),
    // WEB-117: with the studio's strip policy on, a derivative carrying
    // EXIF/GPS is rejected — canvas output always passes, this is the guard.
    verifyNoExif: (await getStudioProfile(ctx.organizationId))?.exifStripDerived ?? false,
  });
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : result.error === "metadata_present" ? 422 : 400;
    return Response.json({ error: result.error }, { status });
  }
  return Response.json({ ok: true });
}
