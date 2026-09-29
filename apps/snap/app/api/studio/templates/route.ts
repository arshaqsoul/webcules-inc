/* /api/studio/templates (WEB-248) — the designers' CRUD surface over the
 * template store. GET lists (optionally per kind, archived included);
 * POST creates with per-kind validation. Form/questionnaire schemas are
 * validated here (file fields Studio-only). */
import { z } from "zod";

import { getOrgContext } from "@/lib/session";
import { getPlanEntitlements } from "@/lib/plans";
import { validateFormSchema } from "@/lib/forms";
import { createTemplate, isTemplateKind, listTemplates, type TemplateKind } from "@/lib/repos/templates";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const kindParam = url.searchParams.get("kind");
  const kind = kindParam && isTemplateKind(kindParam) ? (kindParam as TemplateKind) : undefined;
  const includeArchived = url.searchParams.get("archived") === "1";
  const templates = await listTemplates(ctx.organizationId, kind, { includeArchived });
  return Response.json({
    templates: templates.map((t) => ({ id: t.id, kind: t.kind, name: t.name, isDefault: t.isDefault, archivedAt: t.archivedAt, updatedAt: t.updatedAt })),
  });
}

const createSchema = z.object({
  kind: z.string(),
  name: z.string().trim().min(1).max(120),
  body: z.string().min(1),
  meta: z.record(z.string(), z.unknown()).optional(),
  isDefault: z.boolean().optional(),
});

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!isTemplateKind(body.kind)) return Response.json({ error: "invalid_kind" }, { status: 400 });

  if (body.kind === "form" || body.kind === "questionnaire") {
    const ent = await getPlanEntitlements(ctx.organizationId);
    const allowFile = ent?.id === "studio" || ent?.id === "pro";
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.body);
    } catch {
      return Response.json({ error: "invalid_json" }, { status: 400 });
    }
    const schema = validateFormSchema(parsed, { allowFile });
    if (!schema) return Response.json({ error: allowFile ? "invalid_schema" : "file_fields_require_studio" }, { status: 400 });
  }

  const result = await createTemplate({
    organizationId: ctx.organizationId,
    kind: body.kind,
    name: body.name,
    body: body.body,
    meta: body.meta,
    isDefault: body.isDefault,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ id: result.template.id });
}
