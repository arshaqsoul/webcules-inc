/* /api/studio/templates/{id} (WEB-248) — one template: GET (full row),
 * PATCH (name/body/meta — per-kind validation like create), POST (actions:
 * duplicate | default | restore), DELETE (archive). */
import { z } from "zod";

import { getOrgContext } from "@/lib/session";
import { getPlanEntitlements } from "@/lib/plans";
import { validateFormSchema } from "@/lib/forms";
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
    if (!validateFormSchema(parsed, { allowFile })) {
      return Response.json({ error: allowFile ? "invalid_schema" : "file_fields_require_studio" }, { status: 400 });
    }
  }

  const result = await updateTemplate(ctx.organizationId, id, body);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.error === "not_found" ? 404 : 400 });
  return Response.json({ ok: true });
}

export async function POST(req: Request, { params }: Params) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  let action: string;
  try {
    action = String(((await req.json()) as { action?: string }).action ?? "");
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (action === "duplicate") {
    const result = await duplicateTemplate(ctx.organizationId, id);
    if (!result.ok) return Response.json({ error: result.error }, { status: 404 });
    return Response.json({ id: result.template.id });
  }
  if (action === "default") {
    const result = await setDefaultTemplate(ctx.organizationId, id);
    if (!result.ok) return Response.json({ error: result.error }, { status: 404 });
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
  const { id } = await params;
  const result = await archiveTemplate(ctx.organizationId, id);
  if (!result.ok) return Response.json({ error: result.error }, { status: 404 });
  return Response.json({ ok: true });
}
