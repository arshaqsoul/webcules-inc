/* GET /api/studio/templates/{id}/preview (WEB-248) — live preview for the
 * forms builder: renders the REAL public renderer output (non-interactive)
 * for an iframe. Staff-only. */
import { getOrgContext } from "@/lib/session";
import { renderFormHtml } from "@/lib/forms-render";
import { parseFormSchema } from "@/lib/forms";
import { getTemplate } from "@/lib/repos/templates";
import { renderContractBodyHtml } from "@/lib/contract-body";
import { buildMergeValues } from "@/lib/merge";
import { renderMerge } from "@/lib/merge";
import { getStudioProfile } from "@/lib/repos/studios";

export const dynamic = "force-dynamic";

const VARS = `--snap-font:Inter,system-ui,sans-serif;--snap-bg:#ffffff;--snap-text:#0f1011;--snap-muted:#62666d;--snap-border:#dcdfe3;--snap-surface:#f7f8f8;--snap-radius:8px;--snap-accent:#5e6ad2;`;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const template = await getTemplate(ctx.organizationId, id);
  if (!template) return Response.json({ error: "not_found" }, { status: 404 });
  if (template.kind === "contract" || template.kind === "contract_clause") {
    // Live preview with sample data + real studio brand — the SAME body
    // renderer the signing page uses (no preview/sign drift).
    const profile = await getStudioProfile(ctx.organizationId);
    const brandAccent = typeof (profile?.brand as { accent?: string } | null)?.accent === "string" ? ((profile as { brand?: { accent?: string } }).brand!.accent as string) : "#5e6ad2";
    const accent = /^#[0-9a-fA-F]{6}$/.test(brandAccent) ? brandAccent.toLowerCase() : "#5e6ad2";
    const values = await buildMergeValues({ organizationId: ctx.organizationId });
    const sample: Record<string, string> = {
      client_name: "Maya Patel",
      studio_name: profile?.studioName ?? "Your Studio",
      session_type: "Wedding",
      event_date: "June 14, 2027",
      event_date_long: "June 14, 2027",
      package: "Golden Hour Wedding",
      project_title: "Golden Hour Wedding",
      date: values.today,
      today: values.today,
      total: "$2,900.00",
      deposit: "$500.00",
      studio_legal_name: profile?.studioName ?? "Your Studio LLC",
      client_legal_name: "Maya Patel",
      ...values,
    };
    const merged = renderMerge(template.body, { ...values, ...sample }, { surface: "plain" });
    const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><style>
      body { margin:0; padding:28px; font-family:Inter,system-ui,sans-serif; color:#0f1011; background:#fff; }
      .hdr { border-radius:10px; background:${accent}; color:#fff; padding:16px 20px; font-weight:600; font-size:16px; margin-bottom:20px; }
      h1 { font-size:19px; margin:0 0 14px; }
      .body p { margin:0 0 12px; line-height:1.65; font-size:14px; color:#3f4149; }
      .body ul, .body ol { margin:0 0 12px 20px; font-size:14px; color:#3f4149; }
      .sig { margin-top:28px; padding-top:16px; border-top:1px solid #e3e5e8; font-size:13px; color:#62666d; }
      .note { margin-top:18px; font-size:11px; color:#8a8f98; }
    </style></head><body>
      <div class="hdr">${(profile?.studioName ?? "Your Studio").replace(/[&<>]/g, "")}</div>
      <h1>${template.name.replace(/[&<>]/g, "")}</h1>
      <div class="body">${renderContractBodyHtml(merged)}</div>
      <div class="sig">Signed electronically — typed name, date and IP recorded at signing.</div>
      <p class="note">Preview with sample data. Merge fields resolve from the real project at send.</p>
    </body></html>`;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }

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
