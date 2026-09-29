/* POST /api/projects/{id}/questionnaires (WEB-248) — apply a questionnaire
 * template to a project: mints (or reuses) the tokenized client link and
 * optionally emails it. GET lists responses for the project card. */
import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";
import { getEmailBrand } from "@/lib/branding";
import { questionnaireLinkEmail, sendEmail } from "@/lib/email";
import { clientUrl } from "@/lib/client-urls";
import { createFormResponse, listProjectFormResponses } from "@/lib/repos/forms";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function projectBelongs(orgId: string, projectId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.organizationId, orgId)))
    .limit(1);
  return Boolean(rows[0]);
}

export async function GET(_req: Request, { params }: Params) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await projectBelongs(ctx.organizationId, id))) return Response.json({ error: "not_found" }, { status: 404 });
  const responses = await listProjectFormResponses(ctx.organizationId, id);
  return Response.json({ responses });
}

export async function POST(req: Request, { params }: Params) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await projectBelongs(ctx.organizationId, id))) return Response.json({ error: "not_found" }, { status: 404 });

  let body: { templateId?: unknown; clientEmail?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const templateId = typeof body.templateId === "string" ? body.templateId : "";
  const clientEmail = typeof body.clientEmail === "string" && body.clientEmail.trim() ? body.clientEmail.trim().toLowerCase() : null;
  if (!templateId) return Response.json({ error: "invalid_template" }, { status: 400 });
  if (clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clientEmail)) return Response.json({ error: "invalid_email" }, { status: 400 });

  // Template must be this org's questionnaire.
  const owned = await getDb()
    .select({ id: schema.templates.id })
    .from(schema.templates)
    .where(and(eq(schema.templates.id, templateId), eq(schema.templates.organizationId, ctx.organizationId), inArray(schema.templates.kind, ["questionnaire", "form"])))
    .limit(1);
  if (!owned[0]) return Response.json({ error: "not_found" }, { status: 404 });

  const created = await createFormResponse({ organizationId: ctx.organizationId, projectId: id, templateId, clientEmail });
  const url = await clientUrl(ctx.organizationId, `/q/${created.token}`);

  let emailed = false;
  if (clientEmail) {
    try {
      const [brand, project] = await Promise.all([
        getEmailBrand(ctx.organizationId),
        getDb().select({ title: schema.projects.title }).from(schema.projects).where(eq(schema.projects.id, id)).limit(1),
      ]);
      const tmpl = questionnaireLinkEmail(brand.studioName, {
        projectName: project[0]?.title ?? "your session",
        url,
        accent: brand.accent,
        whiteLabel: brand.whiteLabel,
        emailHeaderUrl: brand.emailHeaderUrl,
        contactEmail: brand.contactEmail,
      });
      emailed = await sendEmail({
        to: clientEmail,
        subject: tmpl.subject,
        html: tmpl.html,
        text: tmpl.text,
        ...(brand.whiteLabel ? { fromName: brand.studioName } : {}),
        organizationId: ctx.organizationId,
        template: "questionnaire.link",
        refId: created.response.id,
      });
    } catch {
      emailed = false;
    }
  }

  await getDb().insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: ctx.organizationId,
    actorType: "user",
    actorId: ctx.user.id,
    action: "questionnaire.sent",
    targetType: "project",
    targetId: id,
    meta: JSON.stringify({ responseId: created.response.id, templateId, emailed }),
  });

  return Response.json({ url, emailed });
}
