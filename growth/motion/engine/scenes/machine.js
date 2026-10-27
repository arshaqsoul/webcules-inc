// The "Not Photography" machine: one chore per station on a long assembly
// line. A client card rides the belt from station to station while the camera
// follows it, then the camera pulls back to show the whole contraption with
// every lamp still blinking, a headline lands, and the machine collapses into
// one Snap block.
//
// props:
//   theme      "dark" (default)
//   stations   [{ kind, label?, caption }]  kinds from engine/stations.js
//   hook       { lines, at, out }           opening headline over the machine
//   follow     { start, per }               when the card reaches station 0, seconds per station
//   counters   [{ label, from, to, kind }]  HUD pills; kind "apps" counts stations reached, "fixed" never moves
//   reveal     { at }                       camera pull-back to the whole machine
//   slam       { at, lines }                the line that names the pain
//   collapse   { at, lines, logo }          stations merge into one block on the light theme
//   kicker     "NOT PHOTOGRAPHY · EP 01"

import { W, clamp, lerp, seg, ease, kinetic, text, wobble, measure } from "../runtime.js";
import { TONE, camera, box, line, defs, faceMatrix } from "../iso.js";
import { STATIONS, PLATE } from "../stations.js";
import { photographer } from "../figure.js";

const SP = 230; // station spacing along x

function cardX(t, f, n) {
  // The card enters from the left, stops at each station centre, then leaves.
  const c = (i) => i * SP + 100;
  if (t < f.start) return lerp(-90, c(0), ease.outCubic(seg(t, f.start - 1.2, f.start)));
  const i = Math.min(n - 1, Math.floor((t - f.start) / f.per));
  if (i >= n - 1 && t > f.start + (n - 1) * f.per) {
    return lerp(c(n - 1), c(n - 1) + 150, ease.inOutCubic(seg(t, f.start + n * f.per - 0.2, f.start + n * f.per + 0.5)));
  }
  const local = t - f.start - i * f.per;
  const move = ease.inOutCubic(seg(local, f.per * 0.72, f.per));
  return lerp(c(i), c(i + 1), i < n - 1 ? move : 0);
}

function stationState(t, f, i, n) {
  const arrive = f.start + i * f.per;
  const k = seg(t, arrive, arrive + f.per * 0.72);
  const active = seg(t, arrive - 0.1, arrive + 0.15) * (1 - seg(t, arrive + f.per * 0.7, arrive + f.per * 0.85));
  return { k, active, visited: t > arrive + f.per * 0.6 ? 1 : 0 };
}

// A faint floor grid under the line, so the machine stands in a place.
function floor(cam, T, len, a) {
  if (a <= 0.01) return "";
  // One path for the whole grid: hundreds of separate lines made each frame slow.
  let d = "";
  const P = (x, y) => cam.p(x, y, -8).map((v) => v.toFixed(1)).join(" ");
  for (let x = -400; x <= len + 400; x += 40) d += `M${P(x, -400)}L${P(x, 520)}`;
  for (let y = -400; y <= 520; y += 40) d += `M${P(-400, y)}L${P(len + 400, y)}`;
  return `<path d="${d}" stroke="#1b1d25" stroke-width="${Math.max(1, cam.s * 0.7).toFixed(2)}" fill="none" opacity="${(0.55 * a).toFixed(3)}"/>`;
}

export default {
  render(t, dur, p, ctx) {
    const T = TONE[p.theme ?? "dusk"];
    const L = TONE.light;
    const n = p.stations.length;
    const f = p.follow;
    const tx = cardX(t, f, n);
    const reveal = ease.inOutCubic(seg(t, p.reveal.at, p.reveal.at + 1.0));
    const slamK = seg(t, p.slam.at, p.slam.at + 0.12);
    const col = p.collapse;
    const c1 = ease.inOutCubic(seg(t, col.at, col.at + 0.9)); // stations slide together and shrink
    const c2 = ease.outBack(seg(t, col.at + 0.55, col.at + 1.25)); // the Snap block grows
    const bgK = seg(t, col.at + 0.25, col.at + 0.95);

    // Camera: follow the card closely, then pull back to fit the whole line.
    const lineEnd = (n - 1) * SP + PLATE.w;
    const followFocus = [clamp(tx + 30, 60, lineEnd), 70, 26];
    const overFocus = [lineEnd / 2, 60, 20];
    const hookPush = 1 - ease.outCubic(seg(t, 0, f.start));
    const sFollow = 3.0 + 0.3 * hookPush;
    const sOver = 1010 / ((lineEnd + 180 + 214) * Math.cos(Math.PI / 6));
    const s = lerp(sFollow, sOver, reveal);
    const fx = lerp(followFocus[0], overFocus[0], reveal);
    const fy = lerp(followFocus[1], overFocus[1], reveal);
    const fz = lerp(followFocus[2], overFocus[2], reveal);
    const shake = Math.pow(1 - seg(t, p.slam.at, p.slam.at + 0.7), 2) * slamK * 16;
    const target = [W / 2 + wobble(t * 0.6, 3) * 6 + wobble(t * 9, 1) * shake, 1010 + wobble(t * 0.5, 7) * 5 + wobble(t * 8, 2) * shake];
    const base = camera(0, 0, s);
    const [px, py] = base.p(fx, fy, fz);
    const cam = camera(target[0] - px, target[1] - py, s);

    const alarm = seg(t, p.reveal.at + 0.4, p.reveal.at + 0.9);
    const desat = clamp(seg(t, p.slam.at, p.slam.at + 0.5) * 0.85 - c1);
    const emails = Math.round(lerp(0, 23, seg(t, f.start, f.start + n * f.per)));

    // Background: a seamless dusk backdrop (or ink on the dark theme), then
    // lavender as the machine becomes one block.
    let b = defs(T);
    b += `<filter id="desat"><feColorMatrix type="saturate" values="${(1 - desat).toFixed(3)}"/></filter>`;
    if (T.backdrop) {
      b += `<defs><radialGradient id="backdrop" cx="0.5" cy="0.42" r="0.78"><stop offset="0" stop-color="${T.backdrop[0]}"/><stop offset="0.55" stop-color="${T.backdrop[1]}"/><stop offset="1" stop-color="${T.backdrop[2]}"/></radialGradient></defs>`;
      b += `<rect width="1080" height="1920" fill="url(#backdrop)"/>`;
    } else {
      b += `<rect width="1080" height="1920" fill="${T.page}"/>`;
      b += floor(cam, T, lineEnd, 1 - seg(t, col.at, col.at + 0.5));
      b += `<rect width="1080" height="1920" fill="url(#vignette)"/>`;
    }

    // Stations, belt and card. Each station gets its own camera so the
    // collapse can slide and shrink it about its own centre.
    const centre = lineEnd / 2;
    let g = `<g${desat > 0.001 ? ' filter="url(#desat)"' : ""} opacity="${(1 - seg(t, col.at + 0.35, col.at + 0.7)).toFixed(3)}">`;
    // The tabletop the whole contraption stands on: the diorama the reveal shows.
    if (T.mat) {
      const top = 1 - seg(t, col.at - 0.05, col.at + 0.2);
      g += box(cam, T, -90, -34, -34, lineEnd + 180, 214, 26, { tone: "woodDark", halo: true, bevel: 1.5, opacity: top });
      g += line(cam, T, [[-90, 180, -14], [lineEnd + 90, 180, -14]], { tone: "#4a2e1c", width: 0.8, opacity: 0.5 * top });
    }
    // Cables between devices, behind everything.
    for (let i = 0; i < n - 1; i++) {
      const a = i * SP + 150;
      const z = 40 + (i % 2) * 12;
      g += line(cam, T, [[a, 3, z], [a + 40, 2, z - 18], [a + 90, 3, z - 6], [a + 110, 4, z + 6]], { tone: T.mat ? "#4a3640" : "lo", width: 2.4, opacity: 1 - c1 });
      g += line(cam, T, [[a, 3, z], [a + 40, 2, z - 18], [a + 90, 3, z - 6], [a + 110, 4, z + 6]], { tone: T.mat ? "#7a6470" : "crease", width: 0.8, opacity: 1 - c1 });
    }
    const fronts = [];
    p.stations.forEach((st, i) => {
      const def = STATIONS[st.kind];
      const x0 = i * SP;
      const shrink = 1 - 0.85 * c1;
      const cx = x0 + 100;
      const [sx, sy] = cam.p(lerp(cx, centre, c1), 62, 0);
      const sc = camera(0, 0, s * shrink);
      const [lx, ly] = sc.p(cx, 62, 0);
      const scam = camera(sx - lx, sy - ly, s * shrink);
      const state = { ...stationState(t, f, i, n), t, alarm, n: emails, rng: null };
      const out = def.draw(scam, T, x0, { ...state, label: st.label ?? def.label });
      g += out.back;
      if (out.front) fronts.push(out.front);
    });
    // Belt: the frame, the moving rollers and the legs between plates.
    if (c1 < 0.98) {
      const op = 1 - c1;
      const bx = -60;
      const bl = lineEnd + 120;
      g += box(cam, T, bx, 66, 8, bl, 38, 10, { tone: "charcoal", opacity: op, bevel: 0.8 });
      const travel = tx;
      for (let x = bx + 4 - (travel % 14) + 14; x < bx + bl - 2; x += 14) g += line(cam, T, [[x, 68, 18], [x, 102, 18]], { tone: T.mat ? "#2a242c" : "lo", width: 0.8, opacity: op });
      for (let i = 0; i < n - 1; i++) g += box(cam, T, i * SP + PLATE.w + 6, 72, -8, 18, 26, 16, { tone: "charcoal", opacity: op });
      // The client card: paper, a lit stripe, and the client's name.
      g += box(cam, T, tx - 14, 75, 18, 28, 20, 4, { tone: "paper", opacity: op });
      g += `<g transform="${faceMatrix(cam, "top", [tx - 12, 77, 22])}" opacity="${op.toFixed(3)}"><rect x="0" y="0" width="24" height="4" fill="${T.litTop}"/><text x="2" y="10" font-family="Inter" font-size="4.6" font-weight="800" fill="#18181a">MAYA + JORDAN</text><text x="2" y="15" font-family="Inter" font-size="3.6" font-weight="600" fill="#6a6a72">wedding · jun 14</text></g>`;
      g += box(cam, T, bx, 104, 8, bl, 4, 16, { tone: "charcoal", opacity: op });
    }
    g += fronts.join("");
    // The photographer walks the line beside the card, camera hanging unused,
    // and slumps when the slam lands. Stride follows distance, so feet never slide.
    if (p.figure !== false) {
      const v = Math.abs(cardX(t + 0.04, f, n) - cardX(t - 0.04, f, n)) / 0.08;
      const walk = clamp(v / 60);
      const slump = ease.inOutCubic(seg(t, p.slam.at - 0.2, p.slam.at + 0.4));
      g += `<g opacity="${(1 - seg(t, col.at, col.at + 0.35)).toFixed(3)}">${photographer(cam, [clamp(tx - 24, -60, lineEnd + 60), 150, -8], { walk, phase: tx * 0.11, slump })}</g>`;
    }
    g += "</g>";
    b += g;

    // A lavender disc opens from where the machine collapsed: the light theme.
    if (bgK > 0) b += `<circle cx="${W / 2}" cy="1090" r="${(1250 * ease.inOutCubic(bgK)).toFixed(1)}" fill="${L.page}"/>`;
    // The Snap block: everything in one place, on the light theme.
    if (c2 > 0.001) {
      const ccam = camera(0, 0, 3.2);
      const sz = 120 * c2;
      const [bx, by] = ccam.p(sz / 2, sz / 2, 0);
      const bcam = camera(W / 2 - bx, 1110 - by, 3.2);
      b += box(bcam, L, 0, 0, 0, sz, sz, 26 * c2, { tone: "lit", halo: true, bevel: 1.5, edge: "#26262a" });
      if (c2 > 0.2) {
        const m = faceMatrix(bcam, "top", [sz * 0.12, sz * 0.12, 26 * c2]);
        b += `<g transform="${m}"><image href="${ctx.asset(col.logo)}" x="0" y="0" width="${(sz * 0.76).toFixed(1)}" height="${(sz * 0.76).toFixed(1)}"/></g>`;
      }
    }

    // HUD: kicker, counters, step captions, hook and slam.
    let fr = "";
    const hudA = seg(t, f.start - 0.3, f.start + 0.2) * (1 - seg(t, col.at, col.at + 0.4));
    fr += text(W / 2, 300, p.kicker, { size: 30, weight: 800, fill: T.mid, spacing: 6, opacity: Math.max(hudA, 1 - seg(t, col.at, col.at + 0.4)) });
    const reached = t < f.start ? 0 : Math.min(n, Math.floor((t - f.start) / f.per) + 1);
    p.counters.forEach((cn, i) => {
      const v = cn.kind === "apps" ? reached : cn.kind === "emails" ? emails : cn.value ?? 0;
      const x = 200 + i * 340;
      const red = cn.kind === "fixed";
      const pulse = red ? 1 + 0.12 * Math.max(0, Math.sin((t - p.slam.at) * 10)) * seg(t, p.slam.at, p.slam.at + 0.1) * (1 - seg(t, p.slam.at + 1.2, p.slam.at + 1.6)) : 1;
      fr += `<g opacity="${hudA.toFixed(3)}" transform="translate(${x} 380) scale(${pulse.toFixed(3)})">`;
      fr += `<rect x="-150" y="-52" width="300" height="104" rx="22" fill="#1a1119" fill-opacity="0.82" stroke="${red && t > p.slam.at ? T.red : "#3a2a36"}" stroke-width="2"/>`;
      fr += text(0, -10, cn.label, { size: 22, weight: 700, fill: T.mid, spacing: 3 });
      fr += text(0, 34, String(v), { size: 46, weight: 800, fill: red ? T.red : "#f4f4f6" });
      fr += "</g>";
    });
    // Step caption under the machine while the camera follows.
    const capA = (1 - seg(t, p.reveal.at - 0.2, p.reveal.at + 0.1));
    if (t >= f.start - 0.1) {
      const i = Math.min(n - 1, Math.max(0, Math.floor((t - f.start) / f.per)));
      const local = t - f.start - i * f.per;
      const a = seg(local, 0, 0.18) * (1 - seg(local, f.per - 0.12, f.per)) * capA + (i === n - 1 ? seg(local, 0, 0.18) * capA * seg(local, f.per - 0.12, f.per) : 0);
      const rise = (1 - ease.outCubic(seg(local, 0, 0.3))) * 30;
      const capW = measure(p.stations[i].caption, 56, 800) + 110;
      fr += `<rect x="${(W / 2 - capW / 2).toFixed(1)}" y="${(1350 + rise).toFixed(1)}" width="${capW.toFixed(1)}" height="160" rx="36" fill="#1a1119" opacity="${(0.78 * a).toFixed(3)}"/>`;
      fr += text(W / 2, 1400 + rise, p.stations[i].label ?? STATIONS[p.stations[i].kind].label, { size: 30, weight: 800, fill: T.lit, spacing: 5, opacity: a });
      fr += text(W / 2, 1478 + rise, p.stations[i].caption, { size: 56, weight: 800, fill: "#f4f4f6", opacity: a });
    }
    // Hook over a dimmed machine.
    const dim = 1 - seg(t, p.hook.out - 0.1, p.hook.out + 0.3);
    if (dim > 0) fr = `<rect width="1080" height="1920" fill="#000" opacity="${(0.62 * dim).toFixed(3)}"/>` + fr;
    fr += kinetic(t, p.hook.at, p.hook.lines, { y: 860, size: 100, out: p.hook.out });
    // The slam: what the whole machine has in common.
    fr += kinetic(t, p.slam.at, p.slam.lines, { y: 1420, size: 92, stagger: 0.06, accent: T.red, out: col.at - 0.1, outDur: 0.3 });
    // On the light theme: the answer.
    // The wordmark above the block, the way "airbnb it." sits over its diorama.
    if (col.tagline) {
      const ta = seg(t, col.at + 0.75, col.at + 1.05) * (1 - seg(t, dur - 0.35, dur));
      const ty = 780 + (1 - ease.outCubic(seg(t, col.at + 0.75, col.at + 1.2))) * 40;
      fr += text(W / 2, ty, col.tagline, { size: 168, weight: 800, fill: "#0f1011", spacing: -6, opacity: ta });
    }
    fr += kinetic(t, col.at + 0.95, col.lines, { y: 1450, size: 64, fill: "#0f1011", accent: "#5e6ad2", out: dur - 0.35, outDur: 0.3, weight: 700 });
    return { back: b, front: fr };
  },

  cues(p) {
    const f = p.follow;
    const c = [];
    p.hook.lines.join(" ").split(" ").forEach((_, i) => c.push({ t: p.hook.at + i * 0.09, kind: "tick", gain: 0.5 }));
    c.push({ t: 0, kind: "drone", dur: p.slam.at, gain: 0.5 });
    c.push({ t: f.start - 0.4, kind: "clock", dur: p.slam.at - f.start + 0.4, gain: 0.55, accel: true });
    p.stations.forEach((st, i) => {
      const at = f.start + i * f.per;
      c.push({ t: at, kind: "clunk", gain: 0.8 });
      c.push({ t: at + 0.05, kind: `station:${st.kind}`, dur: f.per * 0.7, gain: 0.55 });
      c.push({ t: at + f.per * 0.72, kind: "whoosh", dur: 0.3, gain: 0.25 });
    });
    c.push({ t: p.reveal.at - 0.1, kind: "riser", dur: p.slam.at - p.reveal.at + 0.1, gain: 0.6 });
    c.push({ t: p.reveal.at + 0.4, kind: "alarm", dur: p.slam.at - p.reveal.at - 0.4, gain: 0.35 });
    c.push({ t: p.slam.at, kind: "boom", gain: 1 });
    c.push({ t: p.collapse.at, kind: "suck", dur: 0.9, gain: 0.6 });
    c.push({ t: p.collapse.at + 0.9, kind: "bloom", gain: 0.8 });
    return c;
  },
};
