/* The booking calendar widget — framework-free HTML in the loader iframe.
 * Month grid + month/year jump (fast year navigation), day drill-down to
 * bookable slots, in-page booking form, branded from the studio profile.
 * First month renders server-side (inline JSON) for instant paint; the
 * visitor's timezone is shown alongside the studio's. */
import { monthDates } from "@/lib/availability";
import { env } from "cloudflare:workers";
import { frameAncestorsDirective, resolveStudioByEmbedKey, safeHexColor } from "@/lib/embed";
import { computeDateSlots } from "@/lib/repos/availability";
import { getStudioProfile } from "@/lib/repos/studios";

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
  });
  if (studio) headers.set("Content-Security-Policy", `${frameAncestorsDirective(studio)};`);

  if (!studio) {
    return new Response(
      `<!doctype html><html><body style="margin:0;font-family:Inter,system-ui,sans-serif;background:#fff;color:#62666d;display:flex;align-items:center;justify-content:center;min-height:320px;"><p style="font-size:14px;">This calendar is unavailable — the studio's embed key looks invalid.</p></body></html>`,
      { status: 404, headers },
    );
  }

  const profile = await getStudioProfile(studio.organizationId);
  const tz = profile?.timezone ?? "UTC";
  const accent = safeHexColor(studio.brand.accent) ?? "#5e6ad2";
  const siteKey = env.TURNSTILE_SITE_KEY ?? "";
  const logo = studio.logoKey
    ? `<img src="/api/embed/logo?key=${esc(studio.embedKey)}" alt="${esc(studio.studioName)}" style="max-height:36px;max-width:160px;object-fit:contain;" />`
    : `<span style="font-size:15px;font-weight:600;color:#0f1011;">${esc(studio.studioName)}</span>`;

  // Server-render the current month's day → slot counts + ISO slots.
  const now = new Date();
  const month = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" }).format(now);
  const days: Record<string, string[]> = {};
  await Promise.all(
    monthDates(month).map(async (date) => {
      const { slots } = await computeDateSlots(studio.organizationId, tz, date);
      if (slots.length) days[date] = slots.map((s) => s.startAt.toISOString());
    }),
  );

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Book ${esc(studio.studioName)}</title>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<style>
  :root { --accent: ${accent}; }
  * { box-sizing: border-box; }
  body { margin:0; padding:20px; font-family:Inter,-apple-system,system-ui,'Segoe UI',Roboto,sans-serif; background:#fff; color:#0f1011; font-size:14px; line-height:1.5; }
  .brand { display:flex; align-items:center; gap:10px; margin-bottom:14px; }
  .tz { font-size:11px; color:#8a8f98; margin-left:auto; }
  .cal-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; gap:8px; }
  .cal-title { font-weight:600; }
  .cal-nav { display:flex; gap:4px; }
  .cal-nav button, .jump { border:1px solid #d0d3d8; background:#fff; border-radius:8px; padding:5px 10px; font:inherit; font-size:13px; cursor:pointer; color:#0f1011; }
  .cal-nav button:hover, .jump:hover { background:#f7f8f8; }
  .grid { display:grid; grid-template-columns:repeat(7,1fr); gap:4px; }
  .dow { text-align:center; font-size:11px; text-transform:uppercase; color:#8a8f98; padding:2px 0; }
  .day { min-height:44px; border:1px solid transparent; border-radius:8px; padding:4px; text-align:left; background:transparent; font:inherit; cursor:pointer; color:#0f1011; }
  .day:disabled { color:#c4c7cc; cursor:default; }
  .day.open { border-color:#e3e5e8; background:#fff; }
  .day.open:hover { border-color:var(--accent); }
  .day.selected { border-color:var(--accent); background:color-mix(in srgb, var(--accent) 10%, #fff); }
  .day .n { font-size:12px; font-weight:500; }
  .day .slots { font-size:10px; color:var(--accent); }
  .panel { margin-top:14px; border-top:1px solid #e3e5e8; padding-top:14px; }
  .slots-grid { display:flex; flex-wrap:wrap; gap:6px; }
  .slot { border:1px solid #d0d3d8; background:#fff; border-radius:8px; padding:7px 12px; font:inherit; font-size:13px; cursor:pointer; }
  .slot:hover, .slot.sel { border-color:var(--accent); background:color-mix(in srgb, var(--accent) 8%, #fff); }
  label { display:block; font-size:13px; font-weight:500; margin:10px 0 4px; color:#3f4149; }
  input, textarea { width:100%; padding:8px 12px; border:1px solid #d0d3d8; border-radius:8px; font:inherit; background:#fff; color:#0f1011; }
  input:focus, textarea:focus { outline:2px solid color-mix(in srgb, var(--accent) 50%, transparent); border-color:var(--accent); }
  .cta { margin-top:14px; width:100%; padding:9px 14px; background:var(--accent); color:#fff; border:0; border-radius:8px; font:inherit; font-weight:500; cursor:pointer; }
  .cta:disabled { opacity:.6; cursor:default; }
  .muted { color:#62666d; font-size:13px; }
  .msg { margin-top:10px; font-size:13px; display:none; padding:10px 12px; border-radius:8px; }
  .msg.ok { display:block; background:#f0f9f1; color:#1e8e3e; }
  .msg.err { display:block; background:#fdf0f0; color:#cc3d3d; }
  .hp { position:absolute; left:-9999px; opacity:0; }
</style>
</head>
<body>
  <div class="brand">${logo}<span class="tz" id="visitor-tz"></span></div>

  <div class="cal-head">
    <select class="jump" id="jump" aria-label="Month"></select>
    <div class="cal-nav">
      <button id="prev" aria-label="Previous month">←</button>
      <button id="next" aria-label="Next month">→</button>
    </div>
  </div>
  <div class="grid" id="dow-grid"></div>
  <div class="grid" id="day-grid"></div>

  <div class="panel" id="panel" hidden>
    <p class="muted" id="panel-title"></p>
    <div class="slots-grid" id="slots"></div>
    <form id="book-form" hidden novalidate>
      <label for="b-name">Your name</label><input id="b-name" required autocomplete="name" />
      <label for="b-email">Email</label><input id="b-email" type="email" required autocomplete="email" />
      <label for="b-phone">Phone (optional)</label><input id="b-phone" type="tel" autocomplete="tel" />
      <label for="b-notes">Anything we should know? (optional)</label><textarea id="b-notes"></textarea>
      <div class="hp" aria-hidden="true"><label>Leave empty<input name="company_website" tabindex="-1" autocomplete="off" /></label></div>
      <div id="ts" style="margin:12px 0 0;"></div>
      <button class="cta" id="book-btn" type="submit">Confirm booking</button>
    </form>
    <div class="msg" id="msg" role="status"></div>
  </div>

<script>
(function () {
  var origin = ${JSON.stringify(url.origin)};
  // postMessage target: the EMBEDDING site's origin (referrer), never snap's
  // own — a snap-origin targetOrigin makes browsers drop the message on
  // cross-origin hosts, silently breaking checkout redirects + auto-height.
  var hostOrigin = null;
  try { if (document.referrer) hostOrigin = new URL(document.referrer).origin; } catch (e) {}
  var key = ${JSON.stringify(studio.embedKey)};
  var tz = ${JSON.stringify(tz)};
  var studioName = ${JSON.stringify(studio.studioName)};
  var data = ${JSON.stringify({ month, days })};
  var selectedDay = null, selectedSlot = null;
  var tsToken = "";
  var SITE_KEY = ${JSON.stringify(siteKey)};
  function initTs() {
    if (SITE_KEY && window.turnstile && !document.getElementById("ts").hasChildNodes()) {
      turnstile.render("#ts", { sitekey: SITE_KEY, callback: function (t) { tsToken = t; } });
    }
  }

  var visitorTz = "UTC";
  try { visitorTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) {}
  var tzEl = document.getElementById("visitor-tz");
  tzEl.textContent = visitorTz === tz ? tz : "times in " + tz;

  function postHeight() {
    parent.postMessage({ type: "snap:height", height: document.documentElement.scrollHeight }, hostOrigin || "*");
  }
  window.addEventListener("load", postHeight);
  window.addEventListener("resize", postHeight);

  var DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  var dowGrid = document.getElementById("dow-grid");
  DOW.forEach(function (d) {
    var el = document.createElement("div"); el.className = "dow"; el.textContent = d; dowGrid.appendChild(el);
  });

  var jump = document.getElementById("jump");
  function monthAdd(month, delta) {
    var y = Number(month.slice(0,4)), m = Number(month.slice(5,7)) - 1 + delta;
    var d = new Date(Date.UTC(y, m, 1));
    return d.toISOString().slice(0,7);
  }
  function monthLabel(month) {
    return new Date(month + "-01T12:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  }
  (function fillJump() {
    var base = data.month;
    for (var i = -2; i <= 14; i++) {
      var mm = monthAdd(base, i);
      var opt = document.createElement("option");
      opt.value = mm; opt.textContent = monthLabel(mm);
      if (mm === base) opt.selected = true;
      jump.appendChild(opt);
    }
  })();

  function render() {
    jump.value = data.month;
    var grid = document.getElementById("day-grid");
    grid.innerHTML = "";
    var first = new Date(data.month + "-01T12:00:00Z");
    var pad = first.getUTCDay();
    var daysIn = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    for (var p = 0; p < pad; p++) {
      var filler = document.createElement("div"); grid.appendChild(filler);
    }
    for (var d = 1; d <= daysIn; d++) {
      var date = data.month + "-" + String(d).padStart(2, "0");
      var slots = data.days[date] || [];
      var btn = document.createElement("button");
      btn.className = "day" + (slots.length ? " open" : "") + (date === selectedDay ? " selected" : "");
      btn.disabled = !slots.length;
      btn.innerHTML = '<span class="n">' + d + "</span>" + (slots.length ? '<div class="slots">' + slots.length + "</div>" : "");
      btn.addEventListener("click", (function (dd, ss) {
        return function () { selectDay(dd, ss); };
      })(date, slots));
      grid.appendChild(btn);
    }
    postHeight();
  }

  function fmtTime(iso) {
    var s = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
    var extra = "";
    if (visitorTz !== tz) {
      extra = " · " + new Intl.DateTimeFormat("en-US", { timeZone: visitorTz, hour: "numeric", minute: "2-digit" }).format(new Date(iso)) + " your time";
    }
    return s + extra;
  }

  function selectDay(date, slots) {
    selectedDay = date; selectedSlot = null;
    document.getElementById("book-form").hidden = true;
    var msg = document.getElementById("msg"); msg.className = "msg";
    var panel = document.getElementById("panel"); panel.hidden = false;
    document.getElementById("panel-title").textContent = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
    var wrap = document.getElementById("slots"); wrap.innerHTML = "";
    slots.forEach(function (iso) {
      var b = document.createElement("button");
      b.className = "slot"; b.type = "button"; b.textContent = fmtTime(iso);
      b.addEventListener("click", function () {
        Array.prototype.forEach.call(wrap.children, function (c) { c.classList.remove("sel"); });
        b.classList.add("sel");
        selectedSlot = iso;
        document.getElementById("book-form").hidden = false;
        initTs();
        postHeight();
      });
      wrap.appendChild(b);
    });
    render();
  }

  function load(month) {
    if (data.month === month && data.days) return Promise.resolve();
    return fetch(origin + "/api/embed/availability?key=" + encodeURIComponent(key) + "&month=" + month)
      .then(function (r) { return r.json(); })
      .then(function (j) { data = { month: j.month, days: j.days }; render(); })
      .catch(function () {});
  }

  document.getElementById("prev").addEventListener("click", function () { load(monthAdd(data.month, -1)); });
  document.getElementById("next").addEventListener("click", function () { load(monthAdd(data.month, 1)); });
  jump.addEventListener("change", function () { load(jump.value); });

  document.getElementById("book-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!selectedSlot) return;
    var btn = document.getElementById("book-btn");
    btn.disabled = true;
    var msg = document.getElementById("msg"); msg.className = "msg"; msg.textContent = "";
    var f = new FormData(e.target);
    try {
      var res = await fetch(origin + "/api/embed/bookings?key=" + encodeURIComponent(key), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotStart: selectedSlot,
          name: f.get("b-name") === null ? document.getElementById("b-name").value : f.get("b-name"),
          email: document.getElementById("b-email").value,
          phone: document.getElementById("b-phone").value,
          notes: document.getElementById("b-notes").value,
          embedOrigin: (document.referrer && new URL(document.referrer).origin) || "",
          turnstileToken: tsToken
        })
      });
      var body = await res.json().catch(function () { return {}; });
      if (res.ok && body.checkoutUrl) {
        msg.className = "msg ok";
        msg.textContent = "Redirecting to secure payment…";
        if (window.parent === window) {
          window.location.href = body.checkoutUrl;
        } else if (hostOrigin) {
          parent.postMessage({ type: "snap:checkout", url: body.checkoutUrl }, hostOrigin);
        } else {
          try { window.top.location.href = body.checkoutUrl; } catch (e) { /* no referrer + nested: loader handles */ }
        }
      } else if (res.ok) {
        document.getElementById("panel").hidden = true;
        msg.className = "msg ok";
        msg.textContent = "Booked! A confirmation email is on its way to you.";
        load(data.month);
      } else if (body.error === "captcha_failed") {
        msg.className = "msg err";
        msg.textContent = "Verification failed — please try again.";
        btn.disabled = false;
      } else {
        msg.className = "msg err";
        msg.textContent = body.error === "slot_unavailable" || body.error === "conflict"
          ? "That slot was just taken — please pick another."
          : "Booking failed — please try again.";
        btn.disabled = false;
      }
    } catch (err) {
      msg.className = "msg err"; msg.textContent = "Network error — please try again."; btn.disabled = false;
    }
    postHeight();
  });

  render();
  setTimeout(postHeight, 300);
})();
</script>
</body>
</html>`;

  return new Response(html, { headers });
}
