// Proof: one client, one project card, every step ticked in one place.
// A clean UI illustration on the light theme, not a screenshot. Every row
// must be something Snap really does, backed by a claim in the spec.
//
// props:
//   headline  ["Same client.", "*One* tab."]
//   client    { name, sub }
//   logo      repo path to the Snap mark
//   rows      [{ title, sub, at }]   at = local seconds when the row ticks
//   footer    { label, value }       the counter that went 6 -> 1

import { W, seg, ease, kinetic, text, clamp, lerp } from "../runtime.js";
import { daySky } from "../decor.js";

const INK = "#0f1011";
const MUTED = "#4a4d63";
const ACCENT = "#5e6ad2";
const GREEN = "#30a46c";

export default {
  render(t, dur, p, ctx) {
    const inA = seg(t, 0, 0.35);
    const outA = 1 - seg(t, dur - 0.3, dur);
    let b = p.sky ? daySky(t + 13, { opacity: inA }) : `<rect width="1080" height="1920" fill="#f1f1fb" opacity="${inA.toFixed(3)}"/>`;
    b += `<defs><radialGradient id="ckGlow" cx="0.5" cy="0.4" r="0.6"><stop offset="0" stop-color="#8b95e8" stop-opacity="0.35"/><stop offset="1" stop-color="#8b95e8" stop-opacity="0"/></radialGradient>`;
    b += `<filter id="ckShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#2b2f6b" flood-opacity="0.18"/></filter></defs>`;
    if (!p.sky) b += `<rect width="1080" height="1920" fill="url(#ckGlow)" opacity="${(inA * outA).toFixed(3)}"/>`;

    // A steady push-in so the held payoff never reads as a frozen frame.
    const push = 1 + 0.06 * ease.inOutCubic(seg(t, 0.9, dur));
    let f = `<g opacity="${outA.toFixed(3)}" transform="translate(${W / 2} 960) scale(${push.toFixed(4)}) translate(${-W / 2} -960)">`;
    f += kinetic(t, 0.15, p.headline, { y: 400, size: 96, fill: INK, accent: ACCENT, stagger: 0.07 });

    // The card slides up and settles.
    const k = ease.outBack(seg(t, 0.25, 0.9));
    const y0 = 580 + (1 - k) * 220;
    const x0 = 90;
    const w = 900;
    const h = 210 + p.rows.length * 150;
    f += `<g opacity="${seg(t, 0.25, 0.5).toFixed(3)}">`;
    f += `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="44" fill="#ffffff" filter="url(#ckShadow)"/>`;
    f += `<image href="${ctx.asset(p.logo)}" x="${x0 + 44}" y="${y0 + 44}" width="96" height="96"/>`;
    f += text(x0 + 168, y0 + 90, p.client.name, { size: 46, weight: 800, fill: INK, anchor: "start" });
    f += text(x0 + 168, y0 + 134, p.client.sub, { size: 30, weight: 500, fill: MUTED, anchor: "start" });
    f += `<line x1="${x0 + 44}" x2="${x0 + w - 44}" y1="${y0 + 180}" y2="${y0 + 180}" stroke="#e6e6f0" stroke-width="2"/>`;

    p.rows.forEach((row, i) => {
      const ry = y0 + 250 + i * 150;
      const done = seg(t, row.at, row.at + 0.35);
      const pop = ease.outBack(seg(t, row.at, row.at + 0.3));
      const appear = seg(t, 0.5 + i * 0.08, 0.8 + i * 0.08);
      f += `<g opacity="${appear.toFixed(3)}">`;
      // Tick circle: outline, then a filled accent disc with the check drawn in.
      f += `<circle cx="${x0 + 84}" cy="${ry}" r="34" fill="none" stroke="#d4d4e0" stroke-width="4"/>`;
      if (done > 0) {
        f += `<circle cx="${x0 + 84}" cy="${ry}" r="${(34 * pop).toFixed(1)}" fill="${ACCENT}"/>`;
        const len = 60;
        f += `<path d="M${x0 + 68} ${ry + 1}l11 11l22 -24" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${len}" stroke-dashoffset="${(len * (1 - seg(t, row.at + 0.08, row.at + 0.35))).toFixed(1)}"/>`;
      }
      f += text(x0 + 144, ry - 6, row.title, { size: 38, weight: 800, fill: INK, anchor: "start" });
      f += text(x0 + 144, ry + 38, row.sub, { size: 28, weight: 500, fill: MUTED, anchor: "start" });
      // Status pill on the right.
      const pw = 150;
      const px = x0 + w - 44 - pw;
      const fill = done > 0.5 ? "#e7f6ee" : "#f0f0f6";
      f += `<rect x="${px}" y="${ry - 26}" width="${pw}" height="52" rx="26" fill="${fill}"/>`;
      f += text(px + pw / 2, ry + 10, done > 0.5 ? "Done" : "Waiting", { size: 26, weight: 700, fill: done > 0.5 ? GREEN : "#8a8a96" });
      f += "</g>";
    });
    f += "</g>";

    // The counter from the machine, now at one.
    if (p.footer) {
      const fa = seg(t, p.rows.at(-1).at + 0.4, p.rows.at(-1).at + 0.8);
      const fy = y0 + h + 130;
      f += `<g opacity="${fa.toFixed(3)}" transform="translate(${W / 2} ${fy}) scale(${lerp(0.9, 1, ease.outBack(fa)).toFixed(3)})">`;
      f += `<rect x="-210" y="-56" width="420" height="112" rx="26" fill="#ffffff" stroke="#e1e2f2" stroke-width="2"/>`;
      f += text(-30, 14, p.footer.label, { size: 28, weight: 700, fill: MUTED, spacing: 3 });
      f += text(150, 22, p.footer.value, { size: 56, weight: 800, fill: ACCENT });
      f += "</g>";
    }
    f += "</g>";
    return { back: b, front: f };
  },

  cues(p, dur) {
    const c = [
      { t: 0.25, kind: "pop", gain: 0.6 },
      { t: 0, kind: "pad", dur, gain: 0.5, notes: [48, 55, 64, 67, 71] },
      { t: 0.25, kind: "pulse", dur: dur - 0.3, gain: 0.45, bpm: 100 },
    ];
    const notes = [72, 76, 79, 84, 88];
    p.rows.forEach((r, i) => c.push({ t: r.at, kind: "chime", gain: 0.55, note: notes[i % notes.length] }));
    if (p.footer) c.push({ t: p.rows.at(-1).at + 0.45, kind: "pop", gain: 0.5 });
    return c;
  },
};
