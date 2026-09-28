/* The booking calendar widget — framework-free HTML in the loader iframe.
 * Cal-style two-pane layout: month grid left, times panel right; picking a
 * time swaps the panel to the booking form (Back returns to the times list).
 * Stacks vertically in narrow iframes, where the form takes over the full
 * row. Branded from the studio profile. First month renders server-side
 * (inline JSON) for instant paint; the visitor's timezone is shown alongside
 * the studio's. */
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
  /* Cal-style shell: calendar left, times/form right (stacked on narrow).
   * Media queries key off the iframe viewport, so hosts embedding the widget
   * in a narrow column get the stacked layout automatically. Wide screens
   * get a roomier panel where the form fits two fields per row and the
   * full-size Turnstile — keeping the form step no taller than the calendar. */
  .shell { display:grid; grid-template-columns:1fr; gap:16px; align-items:start; }
  @media (min-width:620px) { .shell { grid-template-columns:minmax(0,1fr) 248px; gap:24px; } }
  @media (min-width:860px) { .shell { grid-template-columns:minmax(0,1fr) 360px; gap:28px; } }
  /* Stacked layout: once the visitor opens the form, it takes over the row —
   * no calendar + form scroll marathon. */
  @media (max-width:619px) { .shell.form-open .cal-wrap { display:none; } }
  .cal-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
  .cal-title { font-weight:600; font-size:15px; }
  .cal-nav { display:flex; gap:4px; }
  .cal-nav button { width:32px; height:32px; display:inline-flex; align-items:center; justify-content:center; border:0; background:transparent; border-radius:999px; font-size:18px; line-height:1; cursor:pointer; color:var(--snap-text); padding:0; }
  .cal-nav button:hover { background:color-mix(in srgb, var(--snap-text) 8%, transparent); }
  .grid { display:grid; grid-template-columns:repeat(7,1fr); gap:4px 2px; }
  @media (min-width:620px) { .grid { gap:4px 4px; } .day { max-width:44px; } }
  @media (min-width:860px) { .grid { gap:4px 8px; } .day { max-width:46px; } }
  .dow { text-align:center; font-size:11px; text-transform:uppercase; color:var(--snap-muted); padding:2px 0; }
  .day { aspect-ratio:1/1; width:100%; max-width:42px; margin:0 auto; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; border:1px solid transparent; border-radius:999px; background:transparent; font:inherit; cursor:pointer; color:var(--snap-text); padding:0; }
  .day:disabled { color:color-mix(in srgb, var(--snap-text) 28%, var(--snap-bg)); cursor:default; }
  .day.open { color:var(--snap-text); }
  .day.open:hover { background:color-mix(in srgb, var(--snap-accent) 12%, var(--snap-bg)); }
  .day.selected { background:var(--snap-accent); color:#fff; }
  .day.selected .n { color:#fff; }
  .day.today:not(.selected) { border-color:var(--snap-accent); }
  .day .n { font-size:13px; font-weight:500; line-height:1; }
  .day .dot { width:4px; height:4px; border-radius:999px; background:var(--snap-accent); }
  .day.selected .dot { background:#fff; }
  .panel { border:1px solid var(--snap-border); background:var(--snap-surface); border-radius:min(calc(var(--snap-radius) + 4px), 22px); padding:16px; }
  .panel-title { margin:0 0 10px; font-size:15px; font-weight:600; color:var(--snap-text); }
  /* Tall enough that the times view is the height ceiling on desktop — the
   * booking form (compact rows, side-by-side fields, full-size Turnstile)
   * then never stretches the widget when it swaps in. */
  .slots { display:flex; flex-direction:column; gap:8px; max-height:380px; overflow-y:auto; }
  .slot { border:1px solid var(--snap-border); background:var(--snap-bg); border-radius:var(--snap-radius); padding:9px 12px; font:inherit; font-size:13px; cursor:pointer; text-align:center; color:var(--snap-text); }
  .slot:hover { border-color:var(--snap-accent); }
  .back { display:inline-flex; align-items:center; border:0; background:transparent; padding:2px 6px; margin:0 0 4px -6px; border-radius:6px; font:inherit; font-size:13px; color:var(--snap-muted); cursor:pointer; }
  .back:hover { color:var(--snap-text); background:color-mix(in srgb, var(--snap-text) 7%, transparent); }
  .slot-summary { margin:0 0 4px; padding:8px 12px; border:1px solid color-mix(in srgb, var(--snap-accent) 45%, var(--snap-border)); border-radius:var(--snap-radius); background:color-mix(in srgb, var(--snap-accent) 8%, var(--snap-bg)); font-size:13px; font-weight:600; text-align:center; color:var(--snap-text); }
  label { display:block; font-size:13px; font-weight:500; margin:10px 0 4px; color:var(--snap-text); }
  input, textarea { width:100%; padding:8px 12px; border:1px solid var(--snap-border); border-radius:var(--snap-radius); font:inherit; background:var(--snap-bg); color:var(--snap-text); }
  input:focus, textarea:focus { outline:2px solid color-mix(in srgb, var(--snap-accent) 50%, transparent); border-color:var(--snap-accent); }
  /* Wide panel: name + email share a row so the form never outgrows the
   * calendar column's height. */
  @media (min-width:860px) { .frow { display:grid; grid-template-columns:1fr 1fr; gap:0 10px; } }
  .cta { margin-top:14px; width:100%; padding:9px 14px; background:var(--snap-accent); color:#fff; border:0; border-radius:var(--snap-radius); font:inherit; font-weight:500; cursor:pointer; }
  .cta:disabled { opacity:.6; cursor:default; }
  .muted { color:var(--snap-muted); font-size:13px; }
  button:focus-visible { outline:2px solid color-mix(in srgb, var(--snap-accent) 60%, transparent); outline-offset:1px; }
  .msg { margin-top:10px; font-size:13px; display:none; padding:10px 12px; border-radius:var(--snap-radius); }
  .msg.ok { display:block; background:color-mix(in srgb, var(--snap-accent) 8%, var(--snap-surface)); color:var(--snap-text); }
  .msg.err { display:block; background:#fdf0f0; color:#cc3d3d; }
  .hp { position:absolute; left:-9999px; opacity:0; }
  /* Confirmation view — the professional "you're booked" moment: check,
   * slot recap, email note, add-to-calendar, book-another. */
  .done { text-align:center; padding:6px 2px 2px; }
  .done-check { width:46px; height:46px; margin:0 auto 12px; border-radius:999px; background:var(--snap-accent); color:#fff; font-size:22px; line-height:46px; font-weight:600; }
  .done-title { margin:0 0 4px; font-size:17px; font-weight:600; color:var(--snap-text); }
  .done-when { margin:0 0 10px; font-size:13px; font-weight:600; color:var(--snap-text); }
  .done-note { margin:0 0 14px; font-size:13px; line-height:1.55; color:var(--snap-muted); }
  .done-note b { color:var(--snap-text); font-weight:600; }
  .done-ics { display:block; margin:0 0 12px; font-size:13px; color:var(--snap-accent); text-decoration:none; }
  .done-ics:hover { text-decoration:underline; }
  .done-again { margin-top:2px; }
</style>
</head>
<body>
  <div class="brand">${logo}<span class="tz" id="visitor-tz"></span></div>

  <div class="shell" id="shell">
  <div class="cal-wrap">
  <div class="cal-head">
    <span class="cal-title" id="cal-title"></span>
    <div class="cal-nav" role="group" aria-label="Navigate months">
      <button id="prev" type="button" aria-label="Previous month">‹</button>
      <button id="next" type="button" aria-label="Next month">›</button>
    </div>
  </div>
  <div class="grid" id="dow-grid"></div>
  <div class="grid" id="day-grid"></div>
  <p class="muted" id="cal-err"></p>
  </div>

  <div class="panel" id="panel" hidden>
    <div id="times-view">
      <p class="panel-title" id="panel-title"></p>
      <div class="slots" id="slots"></div>
    </div>
    <form id="book-form" hidden novalidate>
      <button type="button" class="back" id="back-btn">‹ Back</button>
      <p class="slot-summary" id="slot-summary"></p>
      <div class="frow">
        <div><label for="b-name">Your name</label><input id="b-name" required autocomplete="name" /></div>
        <div><label for="b-email">Email</label><input id="b-email" type="email" required autocomplete="email" /></div>
      </div>
      <label for="b-phone">Phone (optional)</label><input id="b-phone" type="tel" autocomplete="tel" />
      <label for="b-notes">Anything we should know? (optional)</label><textarea id="b-notes"></textarea>
      <div class="hp" aria-hidden="true"><label>Leave empty<input name="company_website" tabindex="-1" autocomplete="off" /></label></div>
      <div id="ts" style="margin:12px 0 0;"></div>
      <button class="cta" id="book-btn" type="submit">Confirm booking</button>
    </form>
    <div id="done-view" hidden>
      <div class="done">
        <div class="done-check" aria-hidden="true">✓</div>
        <p class="done-title">You're booked!</p>
        <p class="done-when" id="done-when"></p>
        <p class="done-note" id="done-note"></p>
        <a class="done-ics" id="done-ics" href="#" target="_blank" rel="noopener">Add to your calendar</a>
        <button type="button" class="cta done-again" id="done-again">Book another time</button>
      </div>
    </div>
    <div class="msg" id="msg" role="status"></div>
  </div>
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

  var shell = document.getElementById("shell");
  var panel = document.getElementById("panel");
  var timesView = document.getElementById("times-view");
  var form = document.getElementById("book-form");
  var doneView = document.getElementById("done-view");
  var slotsWrap = document.getElementById("slots");
  var msg = document.getElementById("msg");

  function showDone(when, email, bookingRef) {
    timesView.hidden = true;
    form.hidden = true;
    doneView.hidden = false;
    shell.classList.remove("form-open");
    document.getElementById("done-when").textContent = when;
    document.getElementById("done-note").innerHTML = "A confirmation email with all the details is on its way to <b>" + esc2(email) + "</b>. " + studioName + " will see your booking instantly.";
    var ics = document.getElementById("done-ics");
    if (bookingRef) {
      ics.href = origin + "/api/embed/ics?booking=" + encodeURIComponent(bookingRef) + "&key=" + encodeURIComponent(key);
      ics.hidden = false;
    } else {
      ics.hidden = true;
    }
    postHeight();
  }
  function esc2(s) {
    var d = document.createElement("div");
    d.textContent = String(s);
    return d.innerHTML;
  }

  document.getElementById("done-again").addEventListener("click", function () {
    doneView.hidden = true;
    panel.hidden = true;
    selectedDay = null; selectedSlot = null;
    render();
    postHeight();
  });

  function initTs() {
    // "normal" (300×65) fits and is half the height of "compact" (130×120) —
    // but only where the panel is ≥360px wide (≥860px iframe). Below that the
    // normal widget overflows the 248px panel and forces a horizontal
    // scrollbar, so it falls back to compact.
    var wide = window.matchMedia && window.matchMedia("(min-width:860px)").matches;
    if (SITE_KEY && window.turnstile && !document.getElementById("ts").hasChildNodes()) {
      turnstile.render("#ts", { sitekey: SITE_KEY, callback: function (t) { tsToken = t; }, size: wide ? "normal" : "compact" });
    }
  }

  var visitorTz = "UTC";
  try { visitorTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) {}
  var tzEl = document.getElementById("visitor-tz");
  tzEl.textContent = visitorTz === tz ? tz : "times in " + tz;

  function postHeight() {
    // body.scrollHeight = true content height, independent of the iframe's
    // current viewport height (documentElement.scrollHeight is floored at
    // the viewport, which makes host height syncs that add padding grow
    // without bound — and never shrink back).
    var h = (document.body && document.body.scrollHeight) || document.documentElement.scrollHeight;
    parent.postMessage({ type: "snap:height", height: h }, hostOrigin || "*");
  }
  window.addEventListener("load", postHeight);
  window.addEventListener("resize", postHeight);

  var DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  var dowGrid = document.getElementById("dow-grid");
  DOW.forEach(function (d) {
    var el = document.createElement("div"); el.className = "dow"; el.textContent = d; dowGrid.appendChild(el);
  });

  function monthAdd(month, delta) {
    var y = Number(month.slice(0,4)), m = Number(month.slice(5,7)) - 1 + delta;
    var d = new Date(Date.UTC(y, m, 1));
    return d.toISOString().slice(0,7);
  }
  function monthLabel(month) {
    return new Date(month + "-01T12:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  }
  function dayLabel(date) {
    return new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  }

  function clearMsg() { msg.className = "msg"; msg.textContent = ""; }

  /* Panel views: the times list and the booking form swap in place; the
   * calendar column stays put so Back really does come back to it. */
  function showTimes() {
    timesView.hidden = false;
    form.hidden = true;
    doneView.hidden = true;
    shell.classList.remove("form-open");
    clearMsg();
  }
  function showForm() {
    timesView.hidden = true;
    form.hidden = false;
    shell.classList.add("form-open");
    clearMsg();
    initTs();
    // Turnstile injects its iframe asynchronously, after this frame's height
    // was already reported — re-measure when it lands (and once late, in
    // case the challenge script itself was still loading).
    if (window.MutationObserver && !showForm.tsObs) {
      showForm.tsObs = new MutationObserver(function () { setTimeout(postHeight, 50); });
      showForm.tsObs.observe(document.getElementById("ts"), { childList: true, subtree: true });
    }
    setTimeout(postHeight, 400);
  }

  function render() {
    // A failed month fetch leaves data.month null — keep the current grid.
    if (!data.month) return;
    document.getElementById("cal-title").textContent = monthLabel(data.month);
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
      btn.className = "day" + (slots.length ? " open" : "") + (date === selectedDay ? " selected" : "") + (date === todayIso() ? " today" : "");
      btn.disabled = !slots.length;
      btn.setAttribute("aria-label", monthLabel(data.month) + " " + d + (slots.length ? ", " + slots.length + " times free" : ""));
      btn.innerHTML = '<span class="n">' + d + "</span>" + (slots.length ? '<span class="dot"></span>' : "");
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
    panel.hidden = false;
    showTimes();
    document.getElementById("panel-title").textContent = dayLabel(date);
    slotsWrap.innerHTML = "";
    slots.forEach(function (iso) {
      var b = document.createElement("button");
      b.className = "slot"; b.type = "button"; b.textContent = fmtTime(iso);
      b.addEventListener("click", function () {
        selectedSlot = iso;
        document.getElementById("slot-summary").textContent = dayLabel(date) + " · " + fmtTime(iso);
        showForm();
        document.getElementById("b-name").focus();
        postHeight();
      });
      slotsWrap.appendChild(b);
    });
    render();
    postHeight();
  }

  document.getElementById("back-btn").addEventListener("click", function () {
    selectedSlot = null;
    showTimes();
    var first = slotsWrap.querySelector(".slot");
    if (first) first.focus();
    postHeight();
  });

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

  function todayIso() {
    var t = new Date();
    return new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  document.getElementById("prev").addEventListener("click", function () { load(monthAdd(data.month, -1)); });
  document.getElementById("next").addEventListener("click", function () { load(monthAdd(data.month, 1)); });

  document.getElementById("book-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!selectedSlot) return;
    var btn = document.getElementById("book-btn");
    btn.disabled = true;
    clearMsg();
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
        // Confirmed: swap the panel to the confirmation view (recap, email
        // note, add-to-calendar) instead of a bare one-liner.
        showDone(
          document.getElementById("slot-summary").textContent || "",
          document.getElementById("b-email").value,
          body.bookingRef
        );
        selectedDay = null; selectedSlot = null;
        // Bust the month cache so the just-booked slot disappears.
        var booked = data.month;
        data = { month: null, days: null };
        load(booked);
      } else if (body.error === "slot_unavailable" || body.error === "conflict") {
        // The picked slot is gone — drop both views and let them re-pick
        // from a freshly loaded month.
        timesView.hidden = true;
        form.hidden = true;
        shell.classList.remove("form-open");
        selectedDay = null; selectedSlot = null;
        msg.className = "msg err";
        msg.textContent = "That slot was just taken — please pick another.";
        // Bust the month cache so the stale slot disappears immediately.
        var gone = data.month;
        data = { month: null, days: null };
        load(gone);
      } else {
        // Verification/payment-form errors keep the form open for a retry.
        msg.className = "msg err";
        msg.textContent = body.error === "captcha_failed"
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
