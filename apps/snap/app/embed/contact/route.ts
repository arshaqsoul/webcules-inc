/* The contact-form widget (WEB-113 origin; schema-driven since WEB-249) —
 * a self-contained HTML document rendered inside the loader's iframe.
 * Framework-free by design (widget bundle budget); fully branded from the
 * studio profile; fields/copy come from the studio's form templates
 * (default = the seeded intake, byte-parity with the pre-designer widget).
 * ?form={templateId} renders a specific named form (Studio multi-form). */
import { env } from "cloudflare:workers";

import { frameAncestorsDirective, resolveStudioByEmbedKey } from "@/lib/embed";
import { resolveWidgetVars, sanitizeTokenBag } from "@/lib/embed-tokens";
import { DEFAULT_CONTACT_FORM_BODY, parseFormSchema, type FormSchema } from "@/lib/forms";
import { renderFormHtml } from "@/lib/forms-render";
import { renderMergeFrom } from "@/lib/merge";
import { getPlanEntitlements } from "@/lib/plans";
import { getDefaultTemplate, getTemplate } from "@/lib/repos/templates";

export const dynamic = "force-dynamic";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? "";
  const studio = await resolveStudioByEmbedKey(key);

  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  });
  if (studio) headers.set("Content-Security-Policy", `${frameAncestorsDirective(studio)};`);

  if (!studio) {
    return new Response(
      `<!doctype html><html><body style="margin:0;font-family:Inter,system-ui,sans-serif;background:#fff;color:#62666d;display:flex;align-items:center;justify-content:center;min-height:200px;"><p style="font-size:14px;">This form is unavailable — the studio's embed key looks invalid.</p></body></html>`,
      { status: 404, headers },
    );
  }

  // Resolve the form: ?form= picks a named template (multi-form, Studio);
  // otherwise the default intake. Studios with no template (or a broken
  // schema) get the canonical hardcoded-equivalent form — zero visual diff.
  const formParam = url.searchParams.get("form") ?? "";
  const template = formParam ? await getTemplate(studio.organizationId, formParam) : await getDefaultTemplate(studio.organizationId, "form");
  const ent = await getPlanEntitlements(studio.organizationId);
  const allowFile = ent?.id === "studio" || ent?.id === "pro";
  let schema: FormSchema | null = template && !template.archivedAt ? parseFormSchema(template.body, { allowFile }) : null;
  if (!schema) schema = parseFormSchema(DEFAULT_CONTACT_FORM_BODY)!;

  // Copy (title/intro/thank-you) supports merge fields, resolved server-side.
  const merged = await renderMergeFrom({ organizationId: studio.organizationId }, `${schema.title ?? "Get in touch"}\u0000${schema.intro ?? ""}\u0000${schema.thankYou ?? ""}`, { surface: "plain" });
  const [title, intro, thankYou] = merged.split("\u0000");
  const meta = safeMeta(template?.meta);
  const redirectUrl = typeof meta.redirectUrl === "string" && /^https:\/\//i.test(meta.redirectUrl) ? meta.redirectUrl : "";

  // WEB-163 token layering: brand defaults → sanitized query overrides
  // (snippet attrs / auto-inherit forwarded by the loader).
  const brand = studio.brand as { accent?: string; fontFamily?: string; theme?: string; tokens?: Record<string, unknown> };
  const overrides = {
    ...sanitizeTokenBag((brand.tokens ?? {}) as Record<string, unknown>),
    ...sanitizeTokenBag(Object.fromEntries(url.searchParams.entries())),
  };
  const { vars, theme } = resolveWidgetVars(brand, overrides);
  const siteKey = env.TURNSTILE_SITE_KEY ?? "";
  const logo = studio.logoKey
    ? `<img src="/api/embed/logo?key=${esc(studio.embedKey)}" alt="${esc(studio.studioName)}" style="max-height:36px;max-width:160px;object-fit:contain;" />`
    : `<span style="font-size:15px;font-weight:600;color:var(--snap-text);">${esc(studio.studioName)}</span>`;

  const html = renderFormHtml({ ...schema, title, intro, thankYou }, {
    postUrl: template
      ? `${url.origin}/api/embed/forms/${template.id}?key=${encodeURIComponent(key)}`
      : `${url.origin}/api/embed/leads?key=${encodeURIComponent(key)}`,
    formOrigin: url.origin,
    siteKey,
    vars,
    theme,
    brandHtml: logo,
    heading: title,
    subheading: intro,
    submitLabel: typeof meta.submitLabel === "string" && meta.submitLabel.trim() ? meta.submitLabel.trim().slice(0, 40) : "Send inquiry",
    redirectUrl,
  });
  return new Response(html, { headers });
}

function safeMeta(raw: string | undefined | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
