/* GET /api/studio/templates/{id}/preview (WEB-248) — live preview for the
 * forms builder: renders the REAL public renderer output (non-interactive)
 * for an iframe. Staff-only. */
import { getOrgContext } from "@/lib/session";
import { renderFormHtml } from "@/lib/forms-render";
import { parseFormSchema } from "@/lib/forms";
import { getTemplate } from "@/lib/repos/templates";

export const dynamic = "force-dynamic";

const VARS = `--snap-font:Inter,system-ui,sans-serif;--snap-bg:#ffffff;--snap-text:#0f1011;--snap-muted:#62666d;--snap-border:#dcdfe3;--snap-surface:#f7f8f8;--snap-radius:8px;--snap-accent:#5e6ad2;`;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const template = await getTemplate(ctx.organizationId, id);
  if (!template) return Response.json({ error: "not_found" }, { status: 404 });
  const schema = parseFormSchema(template.body);
  if (!schema) {
    return new Response(
      `<!doctype html><html><body style="font-family:Inter,system-ui,sans-serif;color:#62666d;display:flex;align-items:center;justify-content:center;min-height:200px;margin:0;"><p style="font-size:13px;">Nothing to preview — this template has no form schema yet.</p></body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
    );
  }
  const html = renderFormHtml(schema, {
    postUrl: "#",
    formOrigin: new URL(req.url).origin,
    siteKey: "",
    vars: VARS,
    theme: "light",
    brandHtml: `<span style="font-size:15px;font-weight:600;color:var(--snap-text);">Your studio</span>`,
    heading: schema.title ?? template.name,
    subheading: schema.intro,
    interactive: false,
  });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
