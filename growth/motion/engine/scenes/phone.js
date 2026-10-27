// End card: the Snap app on a phone, the way the Airbnb films end on the app.
// The phone rises into a bright sky, the day's events fill the Snap inbox,
// then the wordmark, the offer and the URL land above it.
//
// props:
//   tagline  "Snap it."
//   offer    "*0%* commission. *Free* to start."
//   url      "snaphq.app"
//   logo     repo path to the Snap mark
//   title    "Inbox"
//   rows     [{ title, sub, time, color, at }]   at = local seconds the row slides in

import { W, seg, ease, kinetic, text } from "../runtime.js";
import { daySky } from "../decor.js";

export default {
  render(t, dur, p, ctx) {
    const inA = seg(t, 0, 0.35);
    // The sky goes in the front layer: a 3D scene may still be fading out underneath.
    const b = "";

    const rise = ease.outCubic(seg(t, 0.05, 0.9));
    const px = 220;
    const pw = 640;
    const py = 600 + (1 - rise) * 1300;
    let f = daySky(t + 25, { opacity: inA });
    // Phone body, screen, island.
    f += `<defs><filter id="phShadow" x="-30%" y="-10%" width="160%" height="130%"><feDropShadow dx="0" dy="30" stdDeviation="34" flood-color="#2b1f5a" flood-opacity="0.28"/></filter></defs>`;
    f += `<rect x="${px}" y="${py}" width="${pw}" height="1500" rx="96" fill="#17141c" filter="url(#phShadow)"/>`;
    f += `<rect x="${px + 18}" y="${py + 18}" width="${pw - 36}" height="1464" rx="80" fill="#ffffff"/>`;
    f += `<rect x="${W / 2 - 70}" y="${py + 40}" width="140" height="40" rx="20" fill="#17141c"/>`;
    f += text(px + 70, py + 72, "9:41", { size: 28, weight: 700, fill: "#17141c", anchor: "start" });
    // App header.
    f += `<image href="${ctx.asset(p.logo)}" x="${px + 52}" y="${py + 120}" width="72" height="72"/>`;
    f += text(px + 142, py + 172, p.title ?? "Inbox", { size: 50, weight: 800, fill: "#17141c", anchor: "start" });
    const chips = ["All", "Bookings", "Payments"];
    let cx = px + 52;
    chips.forEach((c, i) => {
      const w = c.length * 17 + 48;
      f += `<rect x="${cx}" y="${py + 222}" width="${w}" height="56" rx="28" fill="${i === 0 ? "#5e6ad2" : "#f0f0f6"}"/>`;
      f += text(cx + w / 2, py + 260, c, { size: 26, weight: 700, fill: i === 0 ? "#ffffff" : "#4a4d63" });
      cx += w + 14;
    });
    f += text(px + 52, py + 336, "TODAY", { size: 24, weight: 800, fill: "#8a8a96", anchor: "start", spacing: 3 });
    // The day's events, one by one.
    p.rows.forEach((r, i) => {
      const a = seg(t, r.at, r.at + 0.3);
      if (a <= 0) return;
      const y = py + 372 + i * 132 + (1 - ease.outCubic(a)) * 30;
      f += `<g opacity="${a.toFixed(3)}">`;
      f += `<rect x="${px + 40}" y="${y}" width="${pw - 80}" height="116" rx="28" fill="#f7f7fb"/>`;
      f += `<circle cx="${px + 98}" cy="${y + 58}" r="32" fill="${r.color}"/>`;
      f += `<path d="M${px + 84} ${y + 59}l9 9l18 -20" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
      f += text(px + 148, y + 50, r.title, { size: 30, weight: 800, fill: "#17141c", anchor: "start" });
      f += text(px + 148, y + 88, r.sub, { size: 24, weight: 500, fill: "#5a5d72", anchor: "start" });
      f += text(px + pw - 62, y + 50, r.time, { size: 22, weight: 600, fill: "#8a8a96", anchor: "end" });
      f += "</g>";
    });

    // Wordmark, offer and URL above the phone.
    const ta = seg(t, p.tagAt ?? 1.2, (p.tagAt ?? 1.2) + 0.3);
    f += text(W / 2, 300 + (1 - ease.outCubic(ta)) * 30, p.tagline, { size: 156, weight: 800, fill: "#0f1011", spacing: -6, opacity: ta });
    f += kinetic(t, (p.tagAt ?? 1.2) + 0.35, [p.offer], { y: 395, size: 44, fill: "#0f1011", accent: "#5e6ad2", stagger: 0.05, weight: 700 });
    const ua = ease.outBack(seg(t, (p.tagAt ?? 1.2) + 0.75, (p.tagAt ?? 1.2) + 1.1));
    const pulse = 1 + 0.025 * Math.sin(Math.max(0, t - 2.5) * 4);
    f += `<g transform="translate(${W / 2} 488) scale(${(ua * pulse).toFixed(3)})"><rect x="-200" y="-46" width="400" height="92" rx="46" fill="#17141c"/>`;
    f += text(0, 16, p.url, { size: 44, weight: 800, fill: "#ffffff" }) + "</g>";
    return { back: b, front: f };
  },

  cues(p) {
    const c = [{ t: 0, kind: "whoosh", dur: 0.7, gain: 0.4 }];
    p.rows.forEach((r) => c.push({ t: r.at, kind: "pop", gain: 0.45 }));
    const at = p.tagAt ?? 1.2;
    c.push({ t: at, kind: "hit", gain: 0.8 }, { t: at + 0.05, kind: "shimmer", gain: 0.5 }, { t: at + 0.75, kind: "pop", gain: 0.5 });
    return c;
  },
};
