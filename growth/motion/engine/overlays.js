// The Snap moments drawn over any picture: the time chip and the inbox card.
// Shared by the 3D world and the generated-clip scenes, so both read the same.

import { W, seg, ease, text, measure } from "./runtime.js";

const DOTS = ["#ffb000", "#f26a4d", "#ff8fb1", "#7a5cff"];

/** Time chip at the bottom: "1:00 PM  Fall family photos", in from s0 + 1.1, out by s1. */
export function chip(t, s0, s1, [time, what], i = 0) {
  const ca = seg(t, s0 + 1.1, s0 + 1.4) * (1 - seg(t, s1 - 0.25, s1));
  if (ca <= 0) return "";
  const wTime = measure(time, 40, 800);
  const wWhat = measure(what, 40, 600);
  const w = wTime + wWhat + 120;
  const y = 1430 + (1 - ease.outCubic(ca)) * 24;
  let f = `<g opacity="${ca.toFixed(3)}"><rect x="${(W / 2 - w / 2).toFixed(1)}" y="${y - 52}" width="${w.toFixed(1)}" height="88" rx="44" fill="#ffffff" fill-opacity="0.94"/>`;
  f += `<circle cx="${(W / 2 - w / 2 + 44).toFixed(1)}" cy="${y - 8}" r="11" fill="${DOTS[i % DOTS.length]}"/>`;
  f += text(W / 2 - w / 2 + 70, y + 6, time, { size: 40, weight: 800, fill: "#1d1430", anchor: "start" });
  f += text(W / 2 - w / 2 + 70 + wTime + 18, y + 6, what, { size: 40, weight: 600, fill: "#4a3a5c", anchor: "start" });
  return f + "</g>";
}

/** The Snap inbox card: drops in at tt0, leaves by s1. */
export function inboxCard(t, tt0, s1, ctx, logo, { title, sub }) {
  const raw = seg(t, tt0, tt0 + 0.45);
  const out = seg(t, s1 - 0.2, s1 + 0.25);
  if (raw <= 0 || out >= 1) return "";
  const y = 250 + (1 - ease.outBack(raw)) * -260 - out * 280;
  return toast(ctx, logo, y, title, sub, 1 - out);
}

function toast(ctx, logo, y, title, sub, a) {
  const x = 70;
  const w = 940;
  // Real event titles can be long ("Client opened their gallery for the first time"): shrink to fit the card, never below 30 px.
  const tsize = Math.max(30, Math.min(40, Math.floor(40 * 740 / Math.max(1, measure(title, 40, 800)))));
  return `<g opacity="${a.toFixed(3)}" transform="translate(0 ${y.toFixed(1)})">`
    + `<rect x="${x}" y="0" width="${w}" height="176" rx="40" fill="#ffffff" fill-opacity="0.96"/>`
    + `<image href="${ctx.asset(logo)}" x="${x + 32}" y="34" width="108" height="108"/>`
    + text(x + 168, 62, "SNAP INBOX  ·  now", { size: 24, weight: 800, fill: "#7a6a8c", anchor: "start", spacing: 2 })
    + text(x + 168, 110, title, { size: tsize, weight: 800, fill: "#1d1430", anchor: "start" })
    + text(x + 168, 150, sub, { size: 30, weight: 500, fill: "#5a4a6c", anchor: "start" })
    + `</g>`;
}

/**
 * The poster cover, in the layout of marketing/scripts/poster.mjs, so frame 0 of a
 * reel is a tile that sits in the grid next to the posters. Everything lives inside
 * the 3:4 grid crop (y 240..1680). Shown in full at t = 0, fades out from `out`.
 *   brand  marketing/brands/<brand>.json (theme, name, logo)
 *   p      { kicker, headline: ["Every inquiry", "in *one* inbox."], cta, out }
 */
export function poster(t, ctx, brand, p) {
  const out = p.out ?? 1.8;
  const a = 1 - ease.inOutCubic(seg(t, out, out + 0.45));
  if (a <= 0) return "";
  const th = brand.theme;
  const x0 = 80;
  let f = `<defs><linearGradient id="posterShade" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0" stop-color="${th.bg}" stop-opacity="0.92"/><stop offset="0.36" stop-color="${th.bg}" stop-opacity="0.7"/>`
    + `<stop offset="0.52" stop-color="${th.bg}" stop-opacity="0"/><stop offset="0.8" stop-color="${th.bg}" stop-opacity="0"/>`
    + `<stop offset="1" stop-color="${th.bg}" stop-opacity="0.88"/></linearGradient></defs>`;
  f += `<g opacity="${a.toFixed(3)}"><rect width="1080" height="1920" fill="url(#posterShade)"/>`;
  // Top row: the mark, the name, the kicker pill.
  const ty = 330;
  f += `<image href="${ctx.asset(`marketing/${brand.logo}`)}" x="${x0}" y="${ty - 42}" width="84" height="84"/>`;
  f += text(x0 + 104, ty + 12, brand.name, { size: 34, weight: 600, fill: th.ink, anchor: "start" });
  if (p.kicker) {
    const kw = measure(p.kicker, 24, 400) + 48;
    f += `<rect x="${1000 - kw}" y="${ty - 24}" width="${kw}" height="48" rx="24" fill="none" stroke="${th.accent}" stroke-opacity="0.4" stroke-width="1.5"/>`;
    f += text(1000 - kw / 2, ty + 8, p.kicker, { size: 24, weight: 400, fill: th.accent });
  }
  // Headline: left-aligned, *word* in the italic accent.
  const size = p.size ?? 100;
  p.headline.forEach((line, li) => {
    let x = x0;
    const y = 520 + li * size * 1.02;
    line.split(" ").forEach((w) => {
      const acc = w.includes("*");
      const word = w.replace(/\*/g, "");
      const lead = acc ? word.match(/^[^.,!?]+/)[0] : word;
      const tail = word.slice(lead.length);
      const opt = acc ? { size, weight: 400, fill: th.accent, anchor: "start", italic: true, spacing: -1 } : { size, weight: 600, fill: th.ink, anchor: "start", spacing: -3.5 };
      f += text(x, y, lead, opt);
      x += measure(lead, size, opt.weight) + opt.spacing * lead.length;
      if (tail) { f += text(x, y, tail, { size, weight: 600, fill: th.ink, anchor: "start" }); x += measure(tail, size, 600); }
      x += measure(" ", size, 600);
    });
  });
  // The call to action, bottom left, inside the grid crop and the safe area.
  const cta = p.cta ?? `Start free at ${brand.domain}`;
  const bw = measure(cta, 38, 600) + 104;
  f += `<rect x="${x0}" y="1440" width="${bw}" height="100" rx="50" fill="${th.button}"/>`;
  f += text(x0 + bw / 2, 1503, cta, { size: 38, weight: 600, fill: th.buttonInk });
  return f + "</g>";
}
