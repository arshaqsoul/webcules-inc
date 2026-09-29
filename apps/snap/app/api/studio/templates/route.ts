/* /api/studio/templates (WEB-248) — the designers' CRUD surface over the
 * template store. GET lists (optionally per kind, archived included);
 * POST creates with per-kind validation. Form/questionnaire schemas are
 * validated here (file fields Studio-only). */
import { z } from "zod";

import { getOrgContext } from "@/lib/session";
import { getPlanEntitlements } from "@/lib/plans";
import { countCustomFields, FREE_CUSTOM_FIELD_CAP, validateFormSchema } from "@/lib/forms";
import { countTemplates, createTemplate, isTemplateKind, listTemplates, type TemplateKind } from "@/lib/repos/templates";

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
    templates: templates.map((t) => ({
      id: t.id,
      kind: t.kind,
      name: t.name,
      // sqlite integer → real boolean (clients do `{isDefault && …}` renders)
      isDefault: Boolean(t.isDefault),
      archivedAt: t.archivedAt,
      updatedAt: t.updatedAt,
      // WEB-258: gallery presets apply from the dashboard designer, which
      // needs the design body (≤16 KB rows — the only kind that ships it).
      ...(t.kind === "gallery_preset" ? { body: t.body } : {}),
    })),
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
  const ent = await getPlanEntitlements(ctx.organizationId);

  if (body.kind === "form" || body.kind === "questionnaire") {
    const allowFile = ent?.id === "studio" || ent?.id === "pro";
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.body);
    } catch {
      return Response.json({ error: "invalid_json" }, { status: 400 });
    }
    const schema = validateFormSchema(parsed, { allowFile });
    if (!schema) return Response.json({ error: allowFile ? "invalid_schema" : "file_fields_require_studio" }, { status: 400 });
    const capOk = ent?.id === "studio" || ent?.id === "pro" || countCustomFields(schema) <= FREE_CUSTOM_FIELD_CAP;
    if (!capOk) return Response.json({ error: "custom_fields_limit", limit: FREE_CUSTOM_FIELD_CAP }, { status: 403 });
  }
  // WEB-256: contact forms (Free/Lite 1) + questionnaires (Free 1, Lite 3).
  if (body.kind === "form" || body.kind === "questionnaire") {
    const unlimited = ent?.id === "studio" || ent?.id === "pro";
    const limit = unlimited ? null : body.kind === "form" ? (ent?.maxContactForms ?? 1) : (ent?.maxQuestionnaires ?? 1);
    if (limit !== null && (await countTemplates(ctx.organizationId, body.kind)) >= limit) {
      return Response.json({ error: "limit_reached", limit, kind: body.kind }, { status: 403 });
    }
  }
  // WEB-253: saved snippets — Free/Lite 5, Studio+ unlimited.
  if (body.kind === "email_snippet") {
    const limit = ent ? (ent.id === "studio" || ent.id === "pro" ? null : ent.maxEmailSnippets ?? 5) : 5;
    if (limit !== null && (await countTemplates(ctx.organizationId, "email_snippet")) >= limit) {
      return Response.json({ error: "limit_reached", limit }, { status: 403 });
    }
  }
  // WEB-252: package presets are Lite+; body must parse to preset lines.
  if (body.kind === "invoice_preset") {
    const lite = ent && ent.id !== "free";
    if (!lite) return Response.json({ error: "presets_require_lite" }, { status: 403 });
    const { parsePresetLines } = await import("@/lib/invoice-settings");
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.body);
    } catch {
      return Response.json({ error: "invalid_json" }, { status: 400 });
    }
    if (!Array.isArray(parsed) || !parsePresetLines(body.body).length) {
      return Response.json({ error: "invalid_preset" }, { status: 400 });
    }
  }
  // WEB-258: gallery presets are Lite+ (the design layer); the body itself
  // is validated + canonicalized by the repo (must parse to a design).
  if (body.kind === "gallery_preset") {
    const lite = ent && ent.id !== "free";
    if (!lite) return Response.json({ error: "presets_require_lite" }, { status: 403 });
  }
  // WEB-251: contract-template gate (Free/Lite 2, Studio+ unlimited).
  // Clauses are ungated — they're just text snippets.
  if (body.kind === "contract") {
    const limit = ent ? (ent.id === "studio" || ent.id === "pro" ? null : ent.maxContractTemplates ?? 2) : 2;
    if (limit !== null && (await countTemplates(ctx.organizationId, "contract")) >= limit) {
      return Response.json({ error: "limit_reached", limit }, { status: 403 });
    }
  }
  if ((body.meta as Record<string, unknown> | undefined)?.redirectUrl !== undefined) {
    const r = String((body.meta as Record<string, unknown>).redirectUrl);
    if (r !== "" && !/^https:\/\//i.test(r)) return Response.json({ error: "invalid_redirect" }, { status: 400 });
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
