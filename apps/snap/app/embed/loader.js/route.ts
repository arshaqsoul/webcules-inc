/* The embed loader v2 (WEB-164 + WEB-163) — the single <script> a
 * photographer pastes into their site.
 *
 *   <script src="https://snap.webcules.com/embed/loader.js"
 *           data-snap-key="{embedKey}" async></script>
 *
 * Mount modes (first match wins):
 *  1. Declarative placeholders anywhere on the page (head-safe):
 *     <div data-snap-widget="contact|calendar|calendar-button"
 *          data-snap-key="…" data-snap-theme="auto" …></div>
 *  2. Legacy: exactly one iframe mounted after the script tag (unchanged
 *     behavior — no breaking change).
 *
 * Theming (WEB-163): data-snap-* attributes and/or a data-snap-config JSON
 * blob are forwarded to the iframe as sanitized query tokens;
 * data-snap-theme="auto" forwards the host prefers-color-scheme, and
 * data-snap-inherit="auto" samples the host page's computed font/color/
 * background so widgets blend in without any config.
 *
 * Imperative API for SPAs: window.Snap.mount(selector|el, opts) /
 * window.Snap.destroy(el). Framework-free, ~2KB gzipped.
 */
export const dynamic = "force-dynamic";

const LOADER_JS = `(function () {
  var ORIGIN = "https://snap.webcules.com";
  var TOKEN_ATTRS = ["accent","bg","surface","text","muted","border","radius","fontFamily","theme","inherit","label"];

  function sanitizeHex(v) {
    return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null;
  }
  function sanitizeFont(v) {
    return typeof v === "string" && /^[A-Za-z0-9 ,'"+\\-/()]{3,160}$/.test(v) ? v.slice(0, 160) : null;
  }
  function sanitizeRadius(v) {
    return typeof v === "string" && /^(\\d{1,3}px|\\d{1,2}(\\.\\d+)?rem|50%)$/.test(v) ? v : null;
  }
  function collectTokens(el) {
    var out = {};
    for (var i = 0; i < TOKEN_ATTRS.length; i++) {
      var k = TOKEN_ATTRS[i], v = el.getAttribute("data-snap-" + k.toLowerCase());
      if (v === null) continue;
      if (k === "fontFamily") { var f = sanitizeFont(v); if (f) out.fontFamily = f; }
      else if (k === "radius") { var r = sanitizeRadius(v); if (r) out.radius = r; }
      else if (k === "theme" || k === "inherit" || k === "label") out[k] = v;
      else { var h = sanitizeHex(v); if (h) out[k] = h; }
    }
    var cfg = el.getAttribute("data-snap-config");
    if (cfg) { try { Object.assign(out, JSON.parse(cfg)); } catch (e) {} }
    return out;
  }
  function rgbToHex(rgb) {
    var m = /^rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/.exec(rgb || "");
    if (!m) return "";
    function h(x) { return ("0" + Number(x).toString(16)).slice(-2); }
    return "#" + h(m[1]) + h(m[2]) + h(m[3]);
  }
  function inheritTokens(el) {
    var out = {};
    try {
      var cs = getComputedStyle(el.parentElement || document.body);
      var font = sanitizeFont(cs.fontFamily);
      if (font) out.fontFamily = font;
      var color = sanitizeHex(rgbToHex(cs.color));
      if (color) out.text = color;
      var bg = sanitizeHex(rgbToHex(cs.backgroundColor));
      if (bg) out.bg = bg;
    } catch (e) {}
    return out;
  }
  function buildSrc(widget, key, tokens) {
    var q = "key=" + encodeURIComponent(key);
    var theme = tokens.theme;
    if (theme === "auto" && window.matchMedia) {
      theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    if (theme === "light" || theme === "dark") q += "&theme=" + theme;
    for (var k in tokens) {
      if (k === "theme" || k === "inherit" || k === "label") continue;
      var v = tokens[k];
      if (k === "fontFamily") { var f = sanitizeFont(v); if (f) q += "&fontFamily=" + encodeURIComponent(f); }
      else if (k === "radius") { var r = sanitizeRadius(v); if (r) q += "&radius=" + encodeURIComponent(r); }
      else { var hh = sanitizeHex(v); if (hh) q += "&" + k + "=" + hh; }
    }
    return ORIGIN + "/embed/" + widget + "?" + q;
  }
  function listenResize(frame) {
    window.addEventListener("message", function (event) {
      if (event.origin !== ORIGIN || event.source !== frame.contentWindow) return;
      var data = event.data || {};
      if (data.type === "snap:checkout" && typeof data.url === "string" && data.url.indexOf("https://checkout.stripe.com/") === 0) {
        window.location.href = data.url;
        return;
      }
      if (data.type === "snap:height" && typeof data.height === "number") {
        frame.style.height = Math.max(120, Math.round(data.height)) + "px";
        if (frame.__modal) frame.__modal.style.height = Math.min(Math.round(data.height) + 32, window.innerHeight - 40) + "px";
      }
    });
  }
  function makeFrame(widget, key, tokens) {
    var frame = document.createElement("iframe");
    frame.src = buildSrc(widget, key, tokens);
    frame.title = widget === "contact" ? "Contact form" : "Booking calendar";
    frame.setAttribute("loading", "lazy");
    frame.setAttribute("style", "width:100%;border:0;display:block;min-height:200px;");
    return frame;
  }
  function mountWidget(el, opts) {
    if (!el || el.getAttribute("data-snap-mounted") === "1") return null;
    var widget = (opts && opts.widget) || el.getAttribute("data-snap-widget") || "contact";
    var key = (opts && opts.key) || el.getAttribute("data-snap-key");
    if (!key) return null;
    if (widget === "calendar-button") {
      mountButton(el, key, (opts && opts.label) || el.getAttribute("data-snap-label") || "Book a session", el);
      return null;
    }
    var tokens = collectTokens(el);
    if (opts) for (var k in opts) tokens[k] = opts[k];
    if (tokens.inherit === "auto") { var inh = inheritTokens(el); for (var i in inh) if (!(i in tokens)) tokens[i] = inh[i]; }
    var frame = makeFrame(widget, key, tokens);
    el.appendChild(frame);
    el.setAttribute("data-snap-mounted", "1");
    listenResize(frame);
    return frame;
  }
  function mountButton(container, key, label, cfgEl) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.setAttribute("style", "display:inline-block;background:#5e6ad2;color:#fff;border:0;border-radius:8px;padding:10px 18px;font:inherit;font-weight:500;cursor:pointer;");
    var open = false;
    btn.addEventListener("click", function () {
      if (open) return;
      open = true;
      var tokens = collectTokens(cfgEl || container);
      if (tokens.inherit === "auto") { var inh = inheritTokens(container); for (var i in inh) if (!(i in tokens)) tokens[i] = inh[i]; }
      var overlay = document.createElement("div");
      overlay.setAttribute("style", "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;");
      var modal = document.createElement("div");
      modal.setAttribute("style", "background:#fff;border-radius:16px;max-width:560px;width:100%;max-height:calc(100vh - 40px);overflow:auto;position:relative;");
      var close = document.createElement("button");
      close.type = "button";
      close.setAttribute("aria-label", "Close");
      close.textContent = "\\u2715";
      close.setAttribute("style", "position:absolute;top:10px;right:12px;border:0;background:transparent;font-size:16px;cursor:pointer;color:#62666d;z-index:1;");
      function done() { overlay.remove(); open = false; }
      close.addEventListener("click", done);
      overlay.addEventListener("click", function (e) { if (e.target === overlay) done(); });
      document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { done(); document.removeEventListener("keydown", esc); } });
      var frame = makeFrame("calendar", key, tokens);
      frame.__modal = modal;
      frame.setAttribute("style", "width:100%;border:0;display:block;min-height:420px;");
      modal.appendChild(close);
      modal.appendChild(frame);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      listenResize(frame);
      frame.focus();
    });
    container.appendChild(btn);
    container.setAttribute("data-snap-mounted", "1");
    return btn;
  }
  function scan() {
    var nodes = document.querySelectorAll("[data-snap-widget]");
    for (var i = 0; i < nodes.length; i++) mountWidget(nodes[i], null);
  }
  function boot() {
    scan();
    var s = document.currentScript;
    if (s && s.getAttribute && s.getAttribute("data-snap-key") && !document.querySelector("[data-snap-widget]")) {
      var host = s.getAttribute("data-snap-widget") || "contact";
      var div = document.createElement("div");
      div.setAttribute("data-snap-widget", host === "calendar-button" ? "calendar-button" : host);
      div.setAttribute("data-snap-key", s.getAttribute("data-snap-key"));
      for (var i = 0; i < TOKEN_ATTRS.length; i++) {
        var k = TOKEN_ATTRS[i];
        var v = s.getAttribute("data-snap-" + k.toLowerCase());
        if (v !== null) div.setAttribute("data-snap-" + k.toLowerCase(), v);
      }
      var cfg = s.getAttribute("data-snap-config");
      if (cfg) div.setAttribute("data-snap-config", cfg);
      if (s.parentNode) s.parentNode.insertBefore(div, s.nextSibling);
      mountWidget(div, null);
    }
    window.Snap = {
      version: "2",
      mount: function (target, opts) {
        var el = typeof target === "string" ? document.querySelector(target) : target;
        if (!el) return null;
        if (el.getAttribute("data-snap-mounted") === "1") window.Snap.destroy(el); // re-mount recreates
        return mountWidget(el, opts || {});
      },
      destroy: function (target) {
        var el = typeof target === "string" ? document.querySelector(target) : target;
        if (!el) return;
        el.textContent = "";
        el.removeAttribute("data-snap-mounted");
      },
    };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.addEventListener("hashchange", scan);
})();`;

export function GET() {
  return new Response(LOADER_JS, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
