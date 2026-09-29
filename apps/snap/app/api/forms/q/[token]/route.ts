/* POST /api/forms/q/{token} (WEB-248) — public questionnaire submit.
 * Validation chain: token → honeypot → Turnstile → per-IP rate limit →
 * answers validated against the STORED template schema (never the posted
 * one) → file keys verified as server-minted. Stores answers, acks the
 * client + notifies the studio. */
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getEmailBrand } from "@/lib/branding";
import { sendEmail, questionnaireAckEmail, questionnaireAnsweredEmail } from "@/lib/email";
import { parseFormSchema, validateFormAnswers } from "@/lib/forms";
import { clientIp } from "@/lib/shares/gallery-auth";
import { checkFormRate, getFormResponseByToken, submitFormResponse, verifyFormFileKey } from "@/lib/repos/forms";
import { getTemplate, touchTemplateUsed } from "@/lib/repos/templates";
import { getStudioProfile } from "@/lib/repos/studios";
import { clientUrl } from "@/lib/client-urls";
import { verifyTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.company_website === "string" && body.company_website) return Response.json({ ok: true });

  const response = await getFormResponseByToken(token);
  if (!response) return Response.json({ error: "not_found" }, { status: 404 });
  if (response.submittedAt) return Response.json({ error: "already_submitted" }, { status: 409 });

  if (!(await verifyTurnstile(typeof body.turnstileToken === "string" ? body.turnstileToken : null, req.headers.get("CF-Connecting-IP")))) {
    return Response.json({ error: "captcha_failed" }, { status: 403 });
  }
  const ip = clientIp(req);
  if (ip && !(await checkFormRate("submit", ip))) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const template = await getTemplate(response.organizationId, response.templateId);
  if (!template || template.archivedAt) return Response.json({ error: "not_found" }, { status: 404 });
  const formSchema = parseFormSchema(template.body);
  if (!formSchema) return Response.json({ error: "unavailable" }, { status: 404 });
  await touchTemplateUsed(response.organizationId, template.id);

  const validated = validateFormAnswers(formSchema, body);
  if (!validated.ok) return Response.json({ error: "invalid_answers", fields: validated.errors.map((e) => e.field) }, { status: 400 });

  // File answers: keys must be server-minted for this org (HMAC from the
  // presign response rides as answer.token).
  for (const [fieldId, file] of Object.entries(validated.result.files)) {
    if (!file.token || !(await verifyFormFileKey(response.organizationId, file.key, file.token))) {
      return Response.json({ error: "invalid_file", field: fieldId }, { status: 400 });
    }
  }

  const submitted = await submitFormResponse(response.organizationId, response.id, validated.result);
  if (!submitted.ok) return Response.json({ error: submitted.error }, { status: submitted.error === "not_found" ? 404 : 409 });

  // Ack the client + notify the studio (failures never block the visitor).
  try {
    const [brand, profile, project] = await Promise.all([
      getEmailBrand(response.organizationId),
      getStudioProfile(response.organizationId),
      getDb().select({ title: schema.projects.title }).from(schema.projects).where(eq(schema.projects.id, response.projectId)).limit(1),
    ]);
    const projectName = project[0]?.title ?? "your project";
    if (response.clientEmail) {
      const ack = questionnaireAckEmail(brand.studioName, projectName, {
        accent: brand.accent,
        whiteLabel: brand.whiteLabel,
        emailHeaderUrl: brand.emailHeaderUrl,
        contactEmail: brand.contactEmail,
      });
      await sendEmail({
        to: response.clientEmail,
        subject: ack.subject,
        html: ack.html,
        text: ack.text,
        ...(brand.whiteLabel ? { fromName: brand.studioName } : {}),
        organizationId: response.organizationId,
        template: "questionnaire.ack",
        refId: response.id,
      });
    }
    if (profile?.contactEmail) {
      const notify = questionnaireAnsweredEmail(brand.studioName, projectName, validated.result, formSchema, {
        accent: brand.accent,
        dashboardUrl: await clientUrl(response.organizationId, `/dashboard/projects/${response.projectId}`),
      });
      await sendEmail({
        to: profile.contactEmail,
        subject: notify.subject,
        html: notify.html,
        text: notify.text,
        organizationId: response.organizationId,
        template: "questionnaire.answered",
        refId: response.id,
      });
    }
  } catch {
    /* email failures are non-fatal */
  }

  await getDb().insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: response.organizationId,
    actorType: "client",
    action: "questionnaire.submitted",
    targetType: "project",
    targetId: response.projectId,
    meta: JSON.stringify({ responseId: response.id, templateId: response.templateId }),
  });
  return Response.json({ ok: true });
}
