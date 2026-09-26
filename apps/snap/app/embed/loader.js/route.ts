/* The embed loader — the single <script> a photographer pastes into their site.
 *
 *   <script src="https://snap.webcules.com/embed/loader.js"
 *           data-snap-key="{embedKey}" async></script>
 *
 * Modes (data-snap-widget):
 *  - contact (default): inline contact-form iframe
 *  - calendar: inline booking-calendar iframe
 *  - calendar-button: button that opens the calendar in a modal overlay
 *
 * Framework-free by design — the whole loader is ~1.5KB gzipped.
 */
export const dynamic = "force-dynamic";

const LOADER_JS = `(function () {
  var s = document.currentScript;
  if (!s) return;
  var key = s.getAttribute("data-snap-key");
  var widget = s.getAttribute("data-snap-widget") || "contact";
  if (!key) return;
  var origin = "https://snap.webcules.com";
  var label = s.getAttribute("data-snap-label") || "Book a session";

  function makeFrame(widget) {
    var frame = document.createElement("iframe");
    frame.src = origin + "/embed/" + widget + "?key=" + encodeURIComponent(key);
    frame.title = widget === "contact" ? "Contact form" : "Booking calendar";
    frame.setAttribute("loading", "lazy");
    frame.setAttribute("style", "width:100%;border:0;display:block;min-height:200px;");
    return frame;
  }

  function listenResize(frame) {
    window.addEventListener("message", function (event) {
      if (event.origin !== origin || event.source !== frame.contentWindow) return;
      var data = event.data || {};
      if (data.type === "snap:height" && typeof data.height === "number") {
        frame.style.height = Math.max(120, Math.round(data.height)) + "px";
        if (frame.__modal) {
          frame.__modal.style.height = Math.min(Math.round(data.height) + 32, window.innerHeight - 40) + "px";
        }
      }
    });
  }

  if (widget === "calendar-button") {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.setAttribute("style", "display:inline-block;background:#5e6ad2;color:#fff;border:0;border-radius:8px;padding:10px 18px;font:inherit;font-weight:500;cursor:pointer;");
    var open = false;
    btn.addEventListener("click", function () {
      if (open) return;
      open = true;
      var overlay = document.createElement("div");
      overlay.setAttribute("style", "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;");
      var modal = document.createElement("div");
      modal.setAttribute("style", "background:#fff;border-radius:16px;max-width:560px;width:100%;max-height:calc(100vh - 40px);overflow:auto;position:relative;");
      var close = document.createElement("button");
      close.type = "button";
      close.setAttribute("aria-label", "Close");
      close.textContent = "\\u2715";
      close.setAttribute("style", "position:absolute;top:10px;right:12px;border:0;background:transparent;font-size:16px;cursor:pointer;color:#62666d;z-index:1;");
      close.addEventListener("click", done);
      overlay.addEventListener("click", function (e) { if (e.target === overlay) done(); });
      document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { done(); document.removeEventListener("keydown", esc); } });
      function done() { overlay.remove(); open = false; }
      var frame = makeFrame("calendar");
      frame.__modal = modal;
      frame.setAttribute("style", "width:100%;border:0;display:block;min-height:420px;");
      modal.appendChild(close);
      modal.appendChild(frame);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      listenResize(frame);
      frame.focus();
    });
    s.parentNode.insertBefore(btn, s.nextSibling);
    return;
  }

  var frame = makeFrame(widget);
  s.parentNode.insertBefore(frame, s.nextSibling);
  listenResize(frame);
})();`;

export function GET() {
  return new Response(LOADER_JS, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
