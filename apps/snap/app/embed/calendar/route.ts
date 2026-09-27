/* The booking calendar widget — framework-free HTML in the loader iframe.
 * Month grid + month/year jump (fast year navigation), day drill-down to
 * bookable slots, in-page booking form, branded from the studio profile.
 * First month renders server-side (inline JSON) for instant paint; the
 * visitor's timezone is shown alongside the studio's. */
import { monthDates } from "@/lib/availability";
import { env } from "cloudflare:workers";
import { frameAncestorsDirective, resolveStudioByEmbedKey, safeHexColor } from "@/lib/embed";
import { resolveWidgetVars, sanitizeTokenBag } from "@/lib/embed-tokens";
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
  // WEB-163 token layering: brand defaults → sanitized query overrides.
const brand = studio.brand as { accent?: string; fontFamily?: string; theme?: string; tokens?: Record<string, unknown> };
// Layering: brand token presets → sanitized query overrides (later wins).
const overrides = {
  ...sanitizeTokenBag((brand.tokens ?? {}) as Record<string, unknown>),
  ...sanitizeTokenBag(Object.fromEntries(new URL(req.url).searchParams.entries())),
};
const { vars, theme } = resolveWidgetVars(brand, overrides);
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
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Book ${esc(studio.studioName)}</title>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<style>
  :root { ${vars} }
  * { box-sizing: border-box; }
  body { margin:0; padding:20px; font-family:var(--snap-font); background:var(--snap-bg); color:var(--snap-text); font-size:14px; line-height:1.5; }
  .brand { display:flex; align-items:center; gap:10px; margin-bottom:14px; }
  .tz { font-size:11px; color:var(--snap-muted); margin-left:auto; }
  .cal-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; gap:8px; }
  .cal-title { font-weight:600; }
  .cal-nav { display:flex; gap:4px; }
  .cal-nav button, .jump { border:1px solid var(--snap-border); background:var(--snap-bg); border-radius:var(--snap-radius); padding:5px 10px; font:inherit; font-size:13px; cursor:pointer; color:var(--snap-text); }
  .cal-nav button:hover, .jump:hover { background:var(--snap-surface); }
  .grid { display:grid; grid-template-columns:repeat(7,1fr); gap:4px; }
  .dow { text-align:center; font-size:11px; text-transform:uppercase; color:var(--snap-muted); padding:2px 0; }
  .day { min-height:44px; border:1px solid transparent; border-radius:var(--snap-radius); padding:4px; text-align:left; background:transparent; font:inherit; cursor:pointer; color:var(--snap-text); }
  .day:disabled { color:#c4c7cc; cursor:default; }
  .day.open { border-color:var(--snap-border); background:var(--snap-bg); }
  .day.open:hover { border-color:var(--snap-accent); }
  .day.selected { border-color:var(--snap-accent); background:color-mix(in srgb, var(--snap-accent) 10%, var(--snap-bg)); }
  .day .n { font-size:12px; font-weight:500; }
  .day .slots { font-size:10px; color:var(--snap-accent); }
  .panel { margin-top:14px; border-top:1px solid var(--snap-border); padding-top:14px; }
  .slots-grid { display:flex; flex-wrap:wrap; gap:6px; }
  .slot { border:1px solid var(--snap-border); background:var(--snap-bg); border-radius:var(--snap-radius); padding:7px 12px; font:inherit; font-size:13px; cursor:pointer; }
  .slot:hover, .slot.sel { border-color:var(--snap-accent); background:color-mix(in srgb, var(--snap-accent) 8%, var(--snap-bg)); }
  label { display:block; font-size:13px; font-weight:500; margin:10px 0 4px; color:var(--snap-text); }
  input, textarea { width:100%; padding:8px 12px; border:1px solid var(--snap-border); border-radius:var(--snap-radius); font:inherit; background:var(--snap-bg); color:var(--snap-text); }
  input:focus, textarea:focus { outline:2px solid color-mix(in srgb, var(--snap-accent) 50%, transparent); border-color:var(--snap-accent); }
  .cta { margin-top:14px; width:100%; padding:9px 14px; background:var(--snap-accent); color:#fff; border:0; border-radius:var(--snap-radius); font:inherit; font-weight:500; cursor:pointer; }
  .cta:disabled { opacity:.6; cursor:default; }
  .muted { color:var(--snap-muted); font-size:13px; }
  .views { display:flex; gap:2px; border:1px solid var(--snap-border); border-radius:var(--snap-radius); overflow:hidden; }
  .views button { border:0; background:var(--snap-bg); padding:5px 10px; font:inherit; font-size:12px; cursor:pointer; color:var(--snap-text); }
  .views button[aria-pressed="true"] { background:color-mix(in srgb, var(--snap-accent) 14%, var(--snap-bg)); color:var(--snap-text); font-weight:600; }
  .ynav { display:flex; gap:2px; }
  .week { display:grid; grid-template-columns:repeat(7,1fr); gap:4px; }
  .wk-col { border:1px solid var(--snap-border); border-radius:var(--snap-radius); padding:4px; min-height:120px; display:flex; flex-direction:column; gap:3px; }
  .wk-col.today { border-color:var(--snap-accent); }
  .wk-head { text-align:center; font-size:10px; text-transform:uppercase; color:var(--snap-muted); padding:2px 0; }
  .wk-head b { display:block; font-size:13px; color:var(--snap-text); }
  .wk-slot { border:1px solid var(--snap-border); background:var(--snap-bg); border-radius:var(--snap-radius); padding:4px 2px; font:inherit; font-size:11px; cursor:pointer; color:var(--snap-text); text-align:center; }
  .wk-slot:hover, .wk-slot.sel { border-color:var(--snap-accent); background:color-mix(in srgb, var(--snap-accent) 8%, var(--snap-bg)); }
  .daylist { display:flex; flex-direction:column; gap:6px; }
  .day-title { font-weight:600; margin-bottom:2px; }
  .slot-row { border:1px solid var(--snap-border); background:var(--snap-bg); border-radius:var(--snap-radius); padding:9px 12px; font:inherit; font-size:13px; cursor:pointer; color:var(--snap-text); text-align:left; }
  .slot-row:hover, .slot-row.sel { border-color:var(--snap-accent); background:color-mix(in srgb, var(--snap-accent) 8%, var(--snap-bg)); }
  button:focus-visible, select:focus-visible { outline:2px solid color-mix(in srgb, var(--snap-accent) 60%, transparent); outline-offset:1px; }
  .msg { margin-top:10px; font-size:13px; display:none; padding:10px 12px; border-radius:var(--snap-radius); }
  .msg.ok { display:block; background:color-mix(in srgb, var(--snap-accent) 8%, var(--snap-surface)); color:var(--snap-text); }
  .msg.err { display:block; background:#fdf0f0; color:#cc3d3d; }
  .hp { position:absolute; left:-9999px; opacity:0; }
</style>
</head>
<body>
  <div class="brand">${logo}<span class="tz" id="visitor-tz"></span></div>

  <div class="cal-head">
    <select class="jump" id="jump" aria-label="Month"></select>
    <div class="cal-nav" role="group" aria-label="Navigate">
      <button id="prevYear" aria-label="Previous year">«</button>
      <button id="prev" aria-label="Previous">←</button>
      <button id="next" aria-label="Next">→</button>
      <button id="nextYear" aria-label="Next year">»</button>
    </div>
  </div>
  <div class="views" role="group" aria-label="Calendar view">
    <button type="button" id="vMonth" aria-pressed="true">Month</button>
    <button type="button" id="vWeek" aria-pressed="false">Week</button>
    <button type="button" id="vDay" aria-pressed="false">Day</button>
  </div>
  <div class="grid" id="dow-grid"></div>
  <div class="grid" id="day-grid"></div>
  <div id="alt-grid" hidden></div>
  <p class="muted" id="cal-err"></p>

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
  var view = "month", weekStart = null; // WEB-103: month/week/day views
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

  function addDays(date, n) {
    var t = new Date(date + "T12:00:00Z").getTime() + n * 86400000;
    return new Date(t).toISOString().slice(0, 10);
  }
  function weekOf(date) { // Sunday-start week containing date
    var d = new Date(date + "T12:00:00Z");
    return addDays(date, -d.getUTCDay());
  }

  function render() {
    // A failed month fetch leaves data.month null — keep the current grid.
    if (!data.month) return;
    jump.value = data.month;
    if (view !== "month") { renderAlt(); return; }
    document.getElementById("dow-grid").hidden = false;
    document.getElementById("day-grid").hidden = false;
    document.getElementById("alt-grid").hidden = true;
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
      b.dataset.iso = iso; // week/day views re-select a slot programmatically
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
      .then(function (r) {
        if (!r.ok) throw new Error("http " + r.status);
        return r.json();
      })
      .then(function (j) {
        // Only swap in a well-formed payload — an error body must never
        // blank the calendar.
        if (!j || !j.month || !j.days) throw new Error("bad payload");
        data = { month: j.month, days: j.days };
        document.getElementById("cal-err").textContent = "";
        render();
      })
      .catch(function () {
        document.getElementById("cal-err").textContent = "Couldn't load that month — try again.";
      });
  }

  /* ---- WEB-103: week/day views + year navigation ---- */
  function slotsFor(date) { return (data.days && data.days[date]) || []; }
  function pickSlot(iso) {
    selectedSlot = iso;
    selectedDay = iso.slice(0, 10);
    // Reuse the month drill-down panel: it renders the day's slots + form.
    var slots = slotsFor(selectedDay);
    selectDay(selectedDay, slots);
    // mark the chosen slot selected once rendered
    setTimeout(function () {
      var wrap = document.getElementById("slots");
      for (var i = 0; i < wrap.children.length; i++) {
        var b = wrap.children[i];
        if (b.dataset.iso === iso) {
          b.classList.add("sel");
          b.click();
        }
      }
    }, 0);
  }
  function renderAlt() {
    document.getElementById("dow-grid").hidden = true;
    document.getElementById("day-grid").hidden = true;
    var alt = document.getElementById("alt-grid");
    alt.hidden = false;
    alt.innerHTML = "";
    if (view === "week") {
      var wk = document.createElement("div");
      wk.className = "week";
      for (var i = 0; i < 7; i++) {
        var date = addDays(weekStart, i);
        var inMonth = date.slice(0, 7) === data.month;
        var d = new Date(date + "T12:00:00Z");
        var col = document.createElement("div");
        col.className = "wk-col" + (date === todayIso() ? " today" : "");
        var head = document.createElement("div");
        head.className = "wk-head";
        head.innerHTML = DOW[d.getUTCDay()].slice(0, 3) + "<b>" + d.getUTCDate() + "</b>";
        col.appendChild(head);
        var slots = inMonth ? slotsFor(date) : [];
        if (!slots.length) {
          var none = document.createElement("div");
          none.className = "muted"; none.style.fontSize = "11px";
          none.textContent = inMonth ? "—" : "";
          col.appendChild(none);
        }
        for (var j = 0; j < slots.length; j++) {
          (function (iso) {
            var b = document.createElement("button");
            b.type = "button"; b.className = "wk-slot"; b.textContent = fmtTime(iso);
            b.setAttribute("aria-label", "Book " + fmtTime(iso));
            b.addEventListener("click", function () { pickSlot(iso); });
            col.appendChild(b);
          })(slots[j]);
        }
        wk.appendChild(col);
      }
      alt.appendChild(wk);
    } else if (view === "day") {
      var day = selectedDay && slotsFor(selectedDay).length ? selectedDay : firstOpenDay();
      selectedDay = day;
      var title = document.createElement("p");
      title.className = "day-title";
      title.textContent = new Date(day + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
      alt.appendChild(title);
      var list = document.createElement("div");
      list.className = "daylist";
      var slots = slotsFor(day);
      if (!slots.length) {
        var p = document.createElement("p");
        p.className = "muted";
        p.textContent = "No free times this day — try another.";
        alt.appendChild(p);
      }
      for (var k = 0; k < slots.length; k++) {
        (function (iso) {
          var b = document.createElement("button");
          b.type = "button"; b.className = "slot-row"; b.textContent = fmtTime(iso);
          b.setAttribute("aria-label", "Book " + fmtTime(iso));
          b.addEventListener("click", function () {
            selectedSlot = iso;
            selectDay(day, slots);
            setTimeout(function () {
              for (var m = 0; m < document.getElementById("slots").children.length; m++) {
                var c = document.getElementById("slots").children[m];
                if (c.dataset.iso === iso) { c.classList.add("sel"); c.click(); }
              }
            }, 0);
          });
          list.appendChild(b);
        })(slots[k]);
      }
      alt.appendChild(list);
    }
    postHeight();
  }
  function todayIso() {
    var t = new Date();
    return new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  function firstOpenDay() {
    var keys = Object.keys(data.days || {}).sort();
    return keys[0] || data.month + "-01";
  }
  function setView(v) {
    view = v;
    if (v === "week" && (!weekStart || weekStart.slice(0, 7) !== data.month)) weekStart = weekOf(firstOpenDay());
    if (v === "day" && !selectedDay) selectedDay = firstOpenDay();
    var ids = { month: "vMonth", week: "vWeek", day: "vDay" };
    for (var k in ids) document.getElementById(ids[k]).setAttribute("aria-pressed", k === v ? "true" : "false");
    render();
  }
  document.getElementById("vMonth").addEventListener("click", function () { setView("month"); });
  document.getElementById("vWeek").addEventListener("click", function () { setView("week"); });
  document.getElementById("vDay").addEventListener("click", function () { setView("day"); });

  // prev/next step by the active view unit; year buttons jump a year.
  function step(dir) {
    if (view === "month") return load(monthAdd(data.month, dir));
    if (view === "week") {
      weekStart = addDays(weekStart, dir * 7);
      var m = weekStart.slice(0, 7);
      if (m !== data.month) { load(m); return; }
      return renderAlt();
    }
    selectedDay = addDays(selectedDay, dir);
    var m2 = selectedDay.slice(0, 7);
    if (m2 !== data.month) { load(m2); return; }
    return renderAlt();
  }
  document.getElementById("prev").addEventListener("click", function () { step(-1); });
  document.getElementById("next").addEventListener("click", function () { step(1); });
  document.getElementById("prevYear").addEventListener("click", function () {
    if (view === "month") return load(monthAdd(data.month, -12));
    var t = new Date((view === "week" ? weekStart : selectedDay) + "T12:00:00Z").getTime() - 364 * 86400000;
    if (view === "week") { weekStart = new Date(t).toISOString().slice(0, 10); var m = weekStart.slice(0, 7); if (m !== data.month) return load(m); return renderAlt(); }
    selectedDay = new Date(t).toISOString().slice(0, 10);
    var m2 = selectedDay.slice(0, 7); if (m2 !== data.month) return load(m2);
    return renderAlt();
  });
  document.getElementById("nextYear").addEventListener("click", function () {
    if (view === "month") return load(monthAdd(data.month, 12));
    var t = new Date((view === "week" ? weekStart : selectedDay) + "T12:00:00Z").getTime() + 364 * 86400000;
    if (view === "week") { weekStart = new Date(t).toISOString().slice(0, 10); var m = weekStart.slice(0, 7); if (m !== data.month) return load(m); return renderAlt(); }
    selectedDay = new Date(t).toISOString().slice(0, 10);
    var m2 = selectedDay.slice(0, 7); if (m2 !== data.month) return load(m2);
    return renderAlt();
  });
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
        if (body.error === "slot_unavailable" || body.error === "conflict") {
          msg.textContent = "That slot was just taken — please pick another.";
          // Bust the month cache so the stale slot disappears immediately.
          var gone = data.month;
          data = { month: null, days: null };
          load(gone);
        } else msg.textContent = body.error === "studio_booking_limit"
          ? "This studio can't take more bookings right now — please contact them directly."
          : body.error === "captcha_failed"
          ? "Verification failed — please try again."
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
