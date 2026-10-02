/* /api/studio/templates/{id} (WEB-248) — one template: GET (full row),
 * PATCH (name/body/meta — per-kind validation like create), POST (actions:
 * duplicate | default | restore), DELETE (archive). */
import { permissionDenied } from "@/lib/permissions";
import { z } from "zod";

import { getOrgContext } from "@/lib/session";
import { getPlanEntitlements } from "@/lib/plans";
import { countCustomFields, FREE_CUSTOM_FIELD_CAP, validateFormSchema } from "@/lib/forms";
import {
  archiveTemplate,
  duplicateTemplate,
  getTemplate,
  restoreTemplate,
  setDefaultTemplate,
  updateTemplate,
} from "@/lib/repos/templates";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "documents.manage");
  if (denied) return denied;
  const { id } = await params;
  const t = await getTemplate(ctx.organizationId, id);
  if (!t) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ template: t });
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  body: z.string().min(1).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "documents.manage");
  if (denied) return denied;
  const { id } = await params;
  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const existing = await getTemplate(ctx.organizationId, id);
  if (!existing) return Response.json({ error: "not_found" }, { status: 404 });

  if (body.body !== undefined && (existing.kind === "form" || existing.kind === "questionnaire")) {
    const ent = await getPlanEntitlements(ctx.organizationId);
    const allowFile = ent?.id === "studio" || ent?.id === "pro";
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.body);
    } catch {
      return Response.json({ error: "invalid_json" }, { status: 400 });
    }
    const schema = validateFormSchema(parsed, { allowFile });
    if (!schema) {
      return Response.json({ error: allowFile ? "invalid_schema" : "file_fields_require_studio" }, { status: 400 });
    }
    const capOk = ent?.id === "studio" || ent?.id === "pro" || countCustomFields(schema) <= FREE_CUSTOM_FIELD_CAP;
    if (!capOk) return Response.json({ error: "custom_fields_limit", limit: FREE_CUSTOM_FIELD_CAP }, { status: 403 });
  }
  if (body.meta?.redirectUrl !== undefined) {
    const r = String(body.meta.redirectUrl);
    if (r !== "" && !/^https:\/\//i.test(r)) return Response.json({ error: "invalid_redirect" }, { status: 400 });
  }

  const result = await updateTemplate(ctx.organizationId, id, body);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.error === "not_found" ? 404 : 400 });
  return Response.json({ ok: true });
}

export async function POST(req: Request, { params }: Params) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "documents.manage");
  if (denied) return denied;
  const { id } = await params;
  let action: string;
  try {
    action = String(((await req.json()) as { action?: string }).action ?? "");
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (action === "duplicate") {
    // (audit fix): duplication used to skip every per-kind cap — Free/Lite
    // could clone unlimitedly. Enforce the same limits as create.
    const ent = await getPlanEntitlements(ctx.organizationId);
    const repos = await import("@/lib/repos/templates");
    const src = await repos.getTemplate(ctx.organizationId, id);
    const kind = src?.kind as (typeof repos)["TEMPLATE_KINDS"][number] | undefined;
    if (kind) {
      const { countTemplates, countCustomGalleryPresets } = await import("@/lib/repos/templates");
      if (kind === "gallery_preset") {
        if (!ent || ent.id === "free") return Response.json({ error: "presets_require_lite" }, { status: 403 });
        if (ent.id === "lite" && (await countCustomGalleryPresets(ctx.organizationId)) >= 1) {
          return Response.json({ error: "limit_reached", limit: 1, reason: "custom_looks_require_studio" }, { status: 403 });
        }
      } else {
        const unlimited = ent?.id === "studio" || ent?.id === "pro";
        const limit = unlimited ? null : kind === "contract" ? (ent?.maxContractTemplates ?? 2) : kind === "email_snippet" ? (ent?.maxEmailSnippets ?? 5) : kind === "form" ? (ent?.maxContactForms ?? 1) : kind === "questionnaire" ? (ent?.maxQuestionnaires ?? 1) : null;
        if (limit !== null && (await countTemplates(ctx.organizationId, kind, { excludeStarters: true })) >= limit) {
          return Response.json({ error: "limit_reached", limit }, { status: 403 });
        }
      }
    }
    const result = await duplicateTemplate(ctx.organizationId, id);
    if (!result.ok) return Response.json({ error: result.error }, { status: 404 });
    return Response.json({ id: result.template.id });
  }
  if (action === "default") {
    const result = await setDefaultTemplate(ctx.organizationId, id);
    if (!result.ok) return Response.json({ error: result.error }, { status: 404 });
    return Response.json({ ok: true });
  }
  if (action === "delete") {
    const { hardDeleteTemplate } = await import("@/lib/repos/templates");
    const result = await hardDeleteTemplate(ctx.organizationId, id);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.error === "in_use" ? 409 : 404 });
    return Response.json({ ok: true });
  }
  if (action === "restore") {
    const result = await restoreTemplate(ctx.organizationId, id);
    if (!result.ok) return Response.json({ error: result.error }, { status: 404 });
    return Response.json({ ok: true });
  }
  return Response.json({ error: "invalid_action" }, { status: 400 });
}

export async function DELETE(_req: Request, { params }: Params) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "documents.manage");
  if (denied) return denied;
  const { id } = await params;
  const result = await archiveTemplate(ctx.organizationId, id);
  if (!result.ok) return Response.json({ error: result.error }, { status: 404 });
  return Response.json({ ok: true });
}
