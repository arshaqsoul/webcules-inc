/* The contact-form widget — a self-contained HTML document rendered inside
 * the loader's iframe. Framework-free by design (widget bundle budget); fully
 * branded from the studio profile (accent + logo + name). Light default,
 * studio-accent driven.
 *
 * Epic 4 will swap the body for the full inquiry form + lead capture; this
 * ships the branded shell with height-resize + CSP frame-ancestors.
 */
import { env } from "cloudflare:workers";
import { frameAncestorsDirective, resolveStudioByEmbedKey, safeHexColor } from "@/lib/embed";

export const dynamic = "force-dynamic";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? "";
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

  const accent = safeHexColor(studio.brand.accent) ?? "#5e6ad2";
  const siteKey = env.TURNSTILE_SITE_KEY ?? "";
  const logo = studio.logoKey
    ? `<img src="/api/embed/logo?key=${esc(studio.embedKey)}" alt="${esc(studio.studioName)}" style="max-height:36px;max-width:160px;object-fit:contain;" />`
    : `<span style="font-size:15px;font-weight:600;color:#0f1011;">${esc(studio.studioName)}</span>`;
  const formOrigin = esc(new URL(req.url).origin);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Contact ${esc(studio.studioName)}</title>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<style>
  :root { --accent: ${accent}; }
  * { box-sizing: border-box; }
  body { margin:0; padding:20px; font-family:Inter,-apple-system,system-ui,'Segoe UI',Roboto,sans-serif; background:#ffffff; color:#0f1011; font-size:14px; line-height:1.5; }
  .brand { display:flex; align-items:center; gap:10px; margin-bottom:16px; }
  h1 { font-size:16px; font-weight:600; margin:0 0 2px; }
  p.sub { margin:0 0 18px; color:#62666d; font-size:13px; }
  label { display:block; font-size:13px; font-weight:500; margin:0 0 6px; color:#3f4149; }
  input, textarea, select { width:100%; padding:8px 12px; border:1px solid #d0d3d8; border-radius:8px; font:inherit; background:#fff; color:#0f1011; }
  input:focus, textarea:focus { outline:2px solid color-mix(in srgb, var(--accent) 50%, transparent); outline-offset:0; border-color:var(--accent); }
  .row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .field { margin-bottom:12px; }
  textarea { min-height:88px; resize:vertical; }
  button { width:100%; padding:9px 14px; background:var(--accent); color:#fff; border:0; border-radius:8px; font:inherit; font-weight:500; cursor:pointer; }
  button:hover { filter:brightness(1.08); }
  button:disabled { opacity:.6; cursor:default; }
  .msg { margin-top:10px; font-size:13px; display:none; padding:10px 12px; border-radius:8px; }
  .msg.ok { display:block; background:#f0f9f1; color:#1e8e3e; }
  .msg.err { display:block; background:#fdf0f0; color:#cc3d3d; }
  .hp { position:absolute; left:-9999px; opacity:0; height:0; width:0; }
</style>
</head>
<body>
  <div class="brand">${logo}</div>
  <h1>Get in touch</h1>
  <p class="sub">Tell us about your shoot — we usually reply within a day.</p>
  <form id="lead-form" novalidate>
    <div class="row">
      <div class="field"><label for="f-name">Name</label><input id="f-name" name="name" required autocomplete="name" /></div>
      <div class="field"><label for="f-email">Email</label><input id="f-email" name="email" type="email" required autocomplete="email" /></div>
    </div>
    <div class="row">
      <div class="field"><label for="f-phone">Phone (optional)</label><input id="f-phone" name="phone" type="tel" autocomplete="tel" /></div>
      <div class="field"><label for="f-event">Event date (optional)</label><input id="f-event" name="eventDate" type="date" /></div>
    </div>
    <div class="field"><label for="f-type">What kind of shoot?</label>
      <select id="f-type" name="eventType">
        <option value="">Select…</option>
        <option>Wedding</option><option>Engagement</option><option>Family</option>
        <option>Portrait</option><option>Event</option><option>Commercial</option><option>Other</option>
      </select>
    </div>
    <div class="field"><label for="f-message">Tell us more</label><textarea id="f-message" name="message"></textarea></div>
    <div class="hp" aria-hidden="true"><label>Leave empty<input name="company_website" tabindex="-1" autocomplete="off" /></label></div>
    <div id="ts" style="margin-bottom:12px;"></div>
    <button type="submit">Send inquiry</button>
    <div class="msg" id="form-msg" role="status"></div>
  </form>
<script>
(function () {
  var origin = ${JSON.stringify(formOrigin)};
  // postMessage target: the embedding site's origin (referrer) — a snap-origin
  // targetOrigin makes browsers drop the message on cross-origin hosts.
  var hostOrigin = null;
  try { if (document.referrer) hostOrigin = new URL(document.referrer).origin; } catch (e) {}
  var key = ${JSON.stringify(studio.embedKey)};
  function postHeight() {
    parent.postMessage({ type: "snap:height", height: document.documentElement.scrollHeight }, hostOrigin || "*");
  }
  window.addEventListener("load", postHeight);
  window.addEventListener("resize", postHeight);
  setTimeout(postHeight, 300);

  var form = document.getElementById("lead-form");
  var msg = document.getElementById("form-msg");
  var tsToken = "";
  var SITE_KEY = ${JSON.stringify(siteKey)};
  function initTs() {
    if (SITE_KEY && window.turnstile && !tsToken) {
      turnstile.render("#ts", { sitekey: SITE_KEY, callback: function (t) { tsToken = t; } });
    } else if (SITE_KEY && !window.turnstile) {
      setTimeout(initTs, 400);
    }
  }
  initTs();
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var btn = form.querySelector("button");
    btn.disabled = true; msg.className = "msg"; msg.textContent = "";
    var data = Object.fromEntries(new FormData(form).entries());
    data.embedOrigin = (document.referrer && new URL(document.referrer).origin) || "";
    data.turnstileToken = tsToken;
    try {
      var res = await fetch(origin + "/api/embed/leads?key=" + encodeURIComponent(key), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      var body = await res.json().catch(function () { return {}; });
      if (res.ok) {
        form.style.display = "none";
        msg.className = "msg ok";
        msg.textContent = "Thank you — your inquiry is in! We'll get back to you shortly.";
      } else {
        msg.className = "msg err";
        msg.textContent = body.error === "invalid_input" ? "Please check your name and email." : "Something went wrong — please try again.";
        btn.disabled = false;
      }
    } catch (err) {
      msg.className = "msg err";
      msg.textContent = "Network error — please try again.";
      btn.disabled = false;
    }
    postHeight();
  });
})();
</script>
</body>
</html>`;

  return new Response(html, { headers });
}
