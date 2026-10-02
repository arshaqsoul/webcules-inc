/* GET/PUT /api/studio/email-overrides + GET preview (WEB-253).
 * GET /api/studio/email-overrides?key={template} with ?preview=1 renders
 * the PRODUCTION shell with sample data + the override applied. */
import { permissionDenied } from "@/lib/permissions";
import { z } from "zod";

import { getOrgContext } from "@/lib/session";
import { getEmailBrand } from "@/lib/branding";
import { loadEmailOverrides, OVERRIDABLE_TEMPLATES, saveEmailOverrides, applyEmailOverride } from "@/lib/email-overrides";
import { buildMergeValues } from "@/lib/merge";

export const dynamic = "force-dynamic";

const putSchema = z.record(z.string(), z.object({ subject: z.string().max(120).optional(), intro: z.string().max(1000).optional() }));

export async function GET(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "settings.write");
  if (denied) return denied;
  const url = new URL(req.url);
  if (url.searchParams.get("preview") === "1") {
    const key = url.searchParams.get("key") ?? "";
    const meta = OVERRIDABLE_TEMPLATES.find((t) => t.key === key);
    if (!meta) return Response.json({ error: "unknown_template" }, { status: 404 });
    const { renderEmailPreview } = await import("@/lib/email-preview");
    const html = await renderEmailPreview(ctx.organizationId, key);
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return Response.json({ overrides: await loadEmailOverrides(ctx.organizationId), templates: OVERRIDABLE_TEMPLATES });
}

export async function PUT(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "settings.write");
  if (denied) return denied;
  let body: z.infer<typeof putSchema>;
  try {
    body = putSchema.parse(await req.json());
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const result = await saveEmailOverrides(ctx.organizationId, body);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ ok: true });
}
