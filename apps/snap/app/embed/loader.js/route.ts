/* The embed loader — the single <script> a photographer pastes into their site.
 *
 *   <script src="https://snap.webcules.com/embed/loader.js"
 *           data-snap-key="{embedKey}" async></script>
 *
 * Injects a themed iframe for data-snap-widget (contact | calendar-button …)
 * and auto-resizes it via postMessage from the widget page. Framework-free by
 * design — the whole loader is a few hundred bytes gzipped.
 */
export const dynamic = "force-dynamic";

const LOADER_JS = `(function () {
  var s = document.currentScript;
  if (!s) return;
  var key = s.getAttribute("data-snap-key");
  var widget = s.getAttribute("data-snap-widget") || "contact";
  if (!key) return;
  var origin = "https://snap.webcules.com";

  var frame = document.createElement("iframe");
  frame.src = origin + "/embed/" + widget + "?key=" + encodeURIComponent(key);
  frame.title = widget === "contact" ? "Contact form" : "Book a session";
  frame.setAttribute("loading", "lazy");
  frame.setAttribute("style", "width:100%;border:0;display:block;min-height:200px;");
  frame.setAttribute("data-snap-frame", widget);

  s.parentNode.insertBefore(frame, s.nextSibling);

  window.addEventListener("message", function (event) {
    if (event.origin !== origin || event.source !== frame.contentWindow) return;
    var data = event.data || {};
    if (data.type === "snap:height" && typeof data.height === "number") {
      frame.style.height = Math.max(120, Math.round(data.height)) + "px";
    }
  });
})();`;

export function GET() {
  return new Response(LOADER_JS, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
