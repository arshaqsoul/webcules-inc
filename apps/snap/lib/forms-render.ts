/* Public form renderer (WEB-248) — server-renders framework-free HTML for
 * any validated FormSchema: the embeddable widget (contact-widget pattern:
 * inline styles, token theming, honeypot + Turnstile slot), the standalone
 * questionnaire page, and the dashboard builder's live preview iframe. The
 * same document carries the submit script — POSTs JSON to the given
 * endpoint and never trusts a client-side schema. */
import type { FormField, FormSchema } from "./forms";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export type RenderFormOptions = {
  /** POST target for submissions. */
  postUrl: string;
  /** Origin used for the Turnstile script + absolute fetches. */
  formOrigin: string;
  /** Turnstile site key ("" disables the challenge — tests/local). */
  siteKey: string;
  /** Widget CSS variables (from resolveWidgetVars) — defaults provided. */
  vars: string;
  theme: "light" | "dark";
  /** Brand block above the heading (logo img or studio name span). */
  brandHtml: string;
  heading: string;
  subheading?: string;
  submitLabel?: string;
  /** Extra hidden inputs (e.g. a questionnaire token echo). */
  hiddenInputs?: Record<string, string>;
  /** Honeypot field name. */
  honeypotName?: string;
  /** False for the builder's preview iframe (no script/submit). */
  interactive?: boolean;
};

/** One field's markup — inline styles only (widget budget contract). */
function fieldHtml(f: FormField): string {
  const id = `fld-${esc(f.id)}`;
  const name = `data-${esc(f.id)}`;
  const help = f.help ? `<p style="margin:4px 0 0;font-size:12px;color:var(--snap-muted);">${esc(f.help)}</p>` : "";
  const req = f.required ? ' <span style="color:var(--snap-accent);" aria-hidden="true">*</span>' : "";
  const opt = ' <span style="font-weight:400;color:var(--snap-muted);">(optional)</span>';
  // Checkboxes render their own affordance — the question label stays bare.
  const isCheckbox = f.kind === "checkbox";
  const label = `<label for="${id}" style="display:block;font-size:13px;font-weight:500;margin:0 0 6px;">${esc(f.label)}${isCheckbox ? "" : f.required ? req : opt}</label>`;
  const base = "width:100%;padding:8px 12px;border:1px solid var(--snap-border);border-radius:var(--snap-radius);font:inherit;background:var(--snap-bg);color:var(--snap-text);box-sizing:border-box;";
  let control = "";
  switch (f.kind) {
    case "textarea":
      control = `<textarea id="${id}" name="${name}" style="${base}min-height:88px;resize:vertical;"${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ""}></textarea>`;
      break;
    case "select":
      control = `<select id="${id}" name="${name}" style="${base}"><option value="">Select…</option>${(f.options ?? []).map((o) => `<option>${esc(o)}</option>`).join("")}</select>`;
      break;
    case "radio":
      control = `<div role="radiogroup" style="display:flex;flex-direction:column;gap:6px;">${(f.options ?? [])
        .map((o, i) => `<label style="display:flex;align-items:center;gap:8px;font-weight:400;font-size:14px;"><input type="radio" name="${name}" value="${esc(o)}"${i === 0 ? ' style="accent-color:var(--snap-accent);"' : ' style="accent-color:var(--snap-accent);"'} />${esc(o)}</label>`)
        .join("")}</div>`;
      break;
    case "checkbox":
      control = `<label style="display:flex;align-items:flex-start;gap:8px;font-weight:400;font-size:14px;"><input type="checkbox" name="${name}" style="accent-color:var(--snap-accent);margin-top:3px;" value="yes" /><span>${esc(f.help ?? "Yes")}</span></label>`;
      break;
    case "file":
      control = `<input type="file" id="${id}" name="${name}" style="${base}padding:6px 10px;" data-file="1" />`;
      break;
    case "date":
      control = `<input type="date" id="${id}" name="${name}" style="${base}" />`;
      break;
    case "email":
      control = `<input type="email" id="${id}" name="${name}" autocomplete="email" style="${base}"${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ""} />`;
      break;
    case "phone":
      control = `<input type="tel" id="${id}" name="${name}" autocomplete="tel" style="${base}"${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ""} />`;
      break;
    default:
      control = `<input type="text" id="${id}" name="${name}" style="${base}"${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ""} />`;
  }
  return `${label}${control}${isCheckbox ? "" : help}`;
}

/** Full self-contained document. Structure: half-width fields pair up in a
 * 2-col grid row (contact-widget convention). */
export function renderFormHtml(schema: FormSchema, opts: RenderFormOptions): string {
  const rows: string[] = [];
  let pair: string[] = [];
  const flush = () => {
    if (!pair.length) return;
    rows.push(pair.length === 2 ? `<div class="row">${pair.join("")}</div>` : pair[0]);
    pair = [];
  };
  for (const f of schema.fields) {
    const html = `<div class="field">${fieldHtml(f)}</div>`;
    if (f.half) {
      pair.push(html);
      if (pair.length === 2) flush();
    } else {
      flush();
      rows.push(html);
    }
  }
  flush();

  const honeypot = opts.honeypotName ?? "company_website";
  const hidden = Object.entries(opts.hiddenInputs ?? {})
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}" />`)
    .join("");
  const interactive = opts.interactive !== false;
  const script = interactive
    ? `<script>
(function () {
  var origin = ${JSON.stringify(opts.formOrigin)};
  var postUrl = ${JSON.stringify(opts.postUrl)};
  var siteKey = ${JSON.stringify(opts.siteKey)};
  var hostOrigin = null;
  try { if (document.referrer) hostOrigin = new URL(document.referrer).origin; } catch (e) {}
  function postHeight() {
    try { parent.postMessage({ type: "snap:height", height: document.documentElement.scrollHeight }, hostOrigin || "*"); } catch (e) {}
  }
  window.addEventListener("load", postHeight);
  window.addEventListener("resize", postHeight);
  setTimeout(postHeight, 300);
  var form = document.getElementById("snap-form");
  var msg = document.getElementById("form-msg");
  var btn = form.querySelector("button");
  var tsToken = "";
  function initTs() {
    if (siteKey && window.turnstile && !tsToken) {
      turnstile.render("#ts", { sitekey: siteKey, callback: function (t) { tsToken = t; } });
    } else if (siteKey && !window.turnstile) {
      setTimeout(initTs, 400);
    }
  }
  initTs();
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    btn.disabled = true; msg.className = "msg"; msg.textContent = "";
    var payload = {};
    var fd = new FormData(form);
    fd.forEach(function (v, k) {
      if (k.indexOf("data-") === 0) {
        var id = k.slice(5);
        if (v && typeof v === "object" && v.name) return; // files handled below
        payload[id] = v;
      }
    });
    document.referrer && (payload.embedOrigin = new URL(document.referrer).origin);
    payload.turnstileToken = tsToken;
    // File fields upload first via the presign endpoint, then ride as keys.
    var fileJobs = [];
    form.querySelectorAll("input[type=file][data-file]").forEach(function (input) {
      var f = input.files && input.files[0];
      if (!f) return;
      var id = input.name.slice(5);
      fileJobs.push(
        fetch(postUrl + "/file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field: id, filename: f.name, bytes: f.size, mimeType: f.type }),
        })
          .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || "upload"); return b; }); })
          .then(function (b) {
            return fetch(b.url, { method: "PUT", headers: { "Content-Type": f.type || "application/octet-stream" }, body: f })
              .then(function (r) { if (!r.ok) throw new Error("put"); payload[id] = { key: b.key, name: f.name, bytes: f.size, token: b.token }; });
          })
      );
    });
    try {
      await Promise.all(fileJobs);
      var res = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      var body = await res.json().catch(function () { return {}; });
      if (res.ok) {
        form.style.display = "none";
        msg.className = "msg ok";
        msg.textContent = ${JSON.stringify(schema.thankYou ?? "Thank you — we got it! We'll be in touch shortly.")};
      } else {
        msg.className = "msg err";
        msg.textContent = body.error === "invalid_answers" ? "Please check the highlighted fields." : body.error === "captcha_failed" ? "Please complete the verification." : "Something went wrong — please try again.";
        btn.disabled = false;
      }
    } catch (err) {
      msg.className = "msg err";
      msg.textContent = "Upload failed — please try again.";
      btn.disabled = false;
    }
    postHeight();
  });
})();
</script>`
    : "";

  const tsDiv = opts.siteKey ? `<div id="ts" style="margin-bottom:12px;"></div>` : "";
  const tsScript = opts.siteKey ? `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>` : "";

  return `<!doctype html>
<html lang="en" data-theme="${opts.theme}">
<head>
<meta charset="utf-8 />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${esc(opts.heading)}</title>
${tsScript}
<style>
  :root { ${opts.vars} }
  * { box-sizing: border-box; }
  body { margin:0; padding:20px; font-family:var(--snap-font); background:var(--snap-bg); color:var(--snap-text); font-size:14px; line-height:1.5; }
  .brand { display:flex; align-items:center; gap:10px; margin-bottom:16px; }
  h1 { font-size:16px; font-weight:600; margin:0 0 2px; }
  p.sub { margin:0 0 18px; color:var(--snap-muted); font-size:13px; white-space:pre-line; }
  label { display:block; font-size:13px; font-weight:500; margin:0 0 6px; color:var(--snap-text); }
  input, textarea, select { width:100%; padding:8px 12px; border:1px solid var(--snap-border); border-radius:var(--snap-radius); font:inherit; background:var(--snap-bg); color:var(--snap-text); }
  input:focus, textarea:focus { outline:2px solid color-mix(in srgb, var(--snap-accent) 50%, transparent); outline-offset:0; border-color:var(--snap-accent); }
  .row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .field { margin-bottom:12px; }
  textarea { min-height:88px; resize:vertical; }
  button { width:100%; padding:9px 14px; background:var(--snap-accent); color:#fff; border:0; border-radius:var(--snap-radius); font:inherit; font-weight:500; cursor:pointer; }
  button:hover { filter:brightness(1.08); }
  button:disabled { opacity:.6; cursor:default; }
  .msg { margin-top:10px; font-size:13px; display:none; padding:10px 12px; border-radius:var(--snap-radius); }
  .msg.ok { display:block; background:color-mix(in srgb, var(--snap-accent) 8%, var(--snap-surface)); color:var(--snap-text); }
  .msg.err { display:block; background:#fdf0f0; color:#cc3d3d; }
  html[data-theme="dark"] .msg.err { background:color-mix(in srgb, #cc3d3d 12%, var(--snap-surface)); }
  .hp { position:absolute; left:-9999px; opacity:0; height:0; width:0; }
  @media (max-width: 480px) { .row { grid-template-columns:1fr; } }
</style>
</head>
<body>
  <div class="brand">${opts.brandHtml}</div>
  <h1>${esc(opts.heading)}</h1>
  ${opts.subheading ? `<p class="sub">${esc(opts.subheading)}</p>` : ""}
  <form id="snap-form" novalidate>
    ${hidden}
    ${rows.join("\n    ")}
    <div class="hp" aria-hidden="true"><label>Leave empty<input name="${esc(honeypot)}" tabindex="-1" autocomplete="off" /></label></div>
    ${tsDiv}
    <button type="submit">${esc(opts.submitLabel ?? "Submit")}</button>
    <div class="msg" id="form-msg" role="status"></div>
  </form>
${script}
</body>
</html>`;
}
