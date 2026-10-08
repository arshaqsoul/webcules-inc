/* GET /ts?o=<hostname> - the Turnstile bridge page (WEB-333). Rendered from
 * our main origin so the widget's hostname is always ours; a studio's custom
 * domain embeds it in an iframe and receives the token via postMessage.
 *
 * Only vouches for hosts it can verify: one of our own hosts, or a custom
 * domain with an ACTIVE row. Everything else gets 403. The vouched host is
 * pinned in both `frame-ancestors` and the postMessage target origin. */
import { env } from "cloudflare:workers";

import { APP_HOSTS } from "@/lib/hosts";
import { resolveStudioByHost } from "@/lib/repos/domains";
import { TS_MESSAGE_TYPE, TS_RESET_TYPE, frameAncestorsFor, isPlainHostname } from "@/lib/turnstile-bridge";

export const dynamic = "force-dynamic";

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

export async function GET(req: Request) {
  const host = (new URL(req.url).searchParams.get("o") ?? "").toLowerCase();
  if (!isPlainHostname(host)) return new Response("bad host", { status: 400, headers: { "Cache-Control": "no-store" } });

  const vouched = APP_HOSTS.includes(host) || Boolean(await resolveStudioByHost(host));
  if (!vouched) return new Response("forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });

  const siteKey = env.TURNSTILE_SITE_KEY ?? "";
  const target = `https://${host}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;background:transparent;overflow:hidden}#ts{min-height:65px}</style>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script></head>
<body><div id="ts"></div>
<script>
(function () {
  var TARGET = ${JSON.stringify(target)};
  var TYPE = ${JSON.stringify(TS_MESSAGE_TYPE)};
  var RESET = ${JSON.stringify(TS_RESET_TYPE)};
  var siteKey = ${JSON.stringify(siteKey)};
  var id = null;
  function send(m) { try { parent.postMessage(Object.assign({ type: TYPE }, m), TARGET); } catch (e) {} }
  function init() {
    if (!siteKey) return;
    if (!window.turnstile) return setTimeout(init, 300);
    id = turnstile.render("#ts", {
      sitekey: siteKey,
      callback: function (t) { send({ token: t }); },
      "expired-callback": function () { send({ state: "expired" }); },
      "error-callback": function () { send({ state: "error" }); }
    });
  }
  window.addEventListener("message", function (e) {
    if (e.origin !== TARGET || e.source !== parent) return;
    if (e.data && e.data.type === RESET && window.turnstile && id !== null) turnstile.reset(id);
  });
  init();
})();
</script></body></html>`;
  return new Response(html, { headers: { ...HEADERS, "Content-Security-Policy": frameAncestorsFor(host) } });
}
