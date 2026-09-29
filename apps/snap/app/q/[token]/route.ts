/* Public questionnaire page (WEB-248) — tokenized link-possession URL
 * (contract pattern): /q/{token}. Renders the shared public form renderer
 * themed with the studio brand; a submitted questionnaire shows its
 * thank-you state only. Framework-free HTML keeps this off the app bundle. */
import { env } from "cloudflare:workers";

import { parseFormSchema } from "@/lib/forms";
import { renderFormHtml } from "@/lib/forms-render";
import { getFormResponseByToken } from "@/lib/repos/forms";
import { getTemplate } from "@/lib/repos/templates";
import { getStudioProfile } from "@/lib/repos/studios";
import { safeHexColor } from "@/lib/embed";
import { clientUrl } from "@/lib/client-urls";

export const dynamic = "force-dynamic";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const VARS_LIGHT = `--snap-font:Inter,system-ui,sans-serif;--snap-bg:#ffffff;--snap-text:#0f1011;--snap-muted:#62666d;--snap-border:#dcdfe3;--snap-surface:#f7f8f8;--snap-radius:8px;--snap-accent:#5e6ad2;`;

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const response = await getFormResponseByToken(token);
  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  });

  const notFound = (msg: string) =>
    new Response(
      `<!doctype html><html><body style="margin:0;font-family:Inter,system-ui,sans-serif;background:#fff;color:#62666d;display:flex;align-items:center;justify-content:center;min-height:100vh;"><p style="font-size:14px;">${esc(msg)}</p></body></html>`,
      { status: 404, headers },
    );

  if (!response) return notFound("This questionnaire link is invalid or has been revoked.");
  const template = await getTemplate(response.organizationId, response.templateId);
  if (!template || template.archivedAt) return notFound("This questionnaire is no longer available.");

  const [profile, originUrl] = await Promise.all([getStudioProfile(response.organizationId), clientUrl(response.organizationId, `/q/${token}`)]);
  const brand = profile?.brand as { accent?: string } | null;
  const accent = safeHexColor(brand?.accent ?? "") ?? "#5e6ad2";
  const vars = `${VARS_LIGHT}--snap-accent:${accent};`;
  const studioName = profile?.studioName ?? "your photographer";
  const brandHtml = `<span style="font-size:15px;font-weight:600;color:var(--snap-text);">${esc(studioName)}</span>`;
  const url = new URL(req.url);

  if (response.submittedAt) {
    return new Response(
      `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="robots" content="noindex"/><title>Questionnaire — ${esc(studioName)}</title></head>` +
        `<body style="margin:0;font-family:Inter,system-ui,sans-serif;background:#fff;color:#0f1011;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;">` +
        `<div style="max-width:420px;text-align:center;"><p style="font-size:28px;margin:0 0 8px;">✓</p><h1 style="font-size:20px;margin:0 0 8px;">Thank you!</h1>` +
        `<p style="margin:0;color:#62666d;font-size:14px;line-height:1.6;">Your answers are in with <strong>${esc(studioName)}</strong>. They will follow up if anything is unclear.</p></div></body></html>`,
      { status: 200, headers },
    );
  }

  const schema = parseFormSchema(template.body);
  if (!schema) return notFound("This questionnaire is misconfigured — the studio has been notified.");

  const html = renderFormHtml(schema, {
    postUrl: `${url.origin}/api/forms/q/${token}`,
    formOrigin: url.origin,
    siteKey: env.TURNSTILE_SITE_KEY ?? "",
    vars,
    theme: "light",
    brandHtml,
    heading: schema.title ?? template.name,
    subheading: schema.intro ?? `A few questions from ${studioName} — your answers help them prepare.`,
    submitLabel: "Send answers",
  });
  void originUrl;
  return new Response(html, { headers });
}
