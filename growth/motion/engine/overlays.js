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
  return `<g opacity="${a.toFixed(3)}" transform="translate(0 ${y.toFixed(1)})">`
    + `<rect x="${x}" y="0" width="${w}" height="176" rx="40" fill="#ffffff" fill-opacity="0.96"/>`
    + `<image href="${ctx.asset(logo)}" x="${x + 32}" y="34" width="108" height="108"/>`
    + text(x + 168, 62, "SNAP INBOX  ·  now", { size: 24, weight: 800, fill: "#7a6a8c", anchor: "start", spacing: 2 })
    + text(x + 168, 110, title, { size: 40, weight: 800, fill: "#1d1430", anchor: "start" })
    + text(x + 168, 150, sub, { size: 30, weight: 500, fill: "#5a4a6c", anchor: "start" })
    + `</g>`;
}
