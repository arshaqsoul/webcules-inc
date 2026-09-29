/* The schema-driven embeddable form (WEB-248) — same iframe contract as the
 * contact widget (loader key, token theming, honeypot + Turnstile) but the
 * fields come from a form template (default intake when no ?template= is
 * given). 3/10's contact-form designer reuses this renderer wholesale. */
import { env } from "cloudflare:workers";

import { frameAncestorsDirective, resolveStudioByEmbedKey, safeHexColor } from "@/lib/embed";
import { resolveWidgetVars, sanitizeTokenBag } from "@/lib/embed-tokens";
import { parseFormSchema } from "@/lib/forms";
import { renderFormHtml } from "@/lib/forms-render";
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

  const unavailable = (msg: string) =>
    new Response(
      `<!doctype html><html><body style="margin:0;font-family:Inter,system-ui,sans-serif;background:#fff;color:#62666d;display:flex;align-items:center;justify-content:center;min-height:200px;"><p style="font-size:14px;">${esc(msg)}</p></body></html>`,
      { status: 404, headers },
    );
  if (!studio) return unavailable("This form is unavailable — the studio's embed key looks invalid.");

  const templateParam = url.searchParams.get("template");
  const template = templateParam
    ? await getTemplate(studio.organizationId, templateParam)
    : await getDefaultTemplate(studio.organizationId, "form");
  if (!template || template.archivedAt) return unavailable("This form is no longer available.");

  // File fields are Studio-gated: strip them from render on lower tiers
  // (they cannot have been saved, but a downgraded studio keeps its rows).
  const ent = await import("@/lib/plans").then((m) => m.getPlanEntitlements(studio.organizationId));
  const allowFile = ent?.id === "studio" || ent?.id === "pro";
  const schema = parseFormSchema(template.body, { allowFile });
  if (!schema) return unavailable("This form is being set up — check back shortly.");

  const brand = studio.brand as { accent?: string; fontFamily?: string; theme?: string; tokens?: Record<string, unknown> };
  const overrides = {
    ...sanitizeTokenBag((brand.tokens ?? {}) as Record<string, unknown>),
    ...sanitizeTokenBag(Object.fromEntries(url.searchParams.entries())),
  };
  const { vars, theme } = resolveWidgetVars(brand, overrides);
  const logo = studio.logoKey
    ? `<img src="/api/embed/logo?key=${esc(studio.embedKey)}" alt="${esc(studio.studioName)}" style="max-height:36px;max-width:160px;object-fit:contain;" />`
    : `<span style="font-size:15px;font-weight:600;color:var(--snap-text);">${esc(studio.studioName)}</span>`;

  const html = renderFormHtml(schema, {
    postUrl: `${url.origin}/api/embed/forms/${template.id}?key=${encodeURIComponent(key)}`,
    formOrigin: url.origin,
    siteKey: env.TURNSTILE_SITE_KEY ?? "",
    vars,
    theme,
    brandHtml: logo,
    heading: schema.title ?? "Get in touch",
    subheading: schema.intro ?? `Tell us about your shoot — ${esc(studio.studioName)} usually replies within a day.`,
    submitLabel: "Send inquiry",
  });
  void safeHexColor;
  return new Response(html, { headers });
}
