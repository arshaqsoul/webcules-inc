// Isometric solids for reels, after the anatomy skill's craft rules
// (.claude/skills/anatomy/references/craft.md): solids not wireframes, sides
// shaded by facing, a lighter top, a crease where top meets sides, one lit
// accent, a soft halo under anything that stands, and painter's order.
// Tuned for phone video: lines are thicker and tones further apart than the
// kit's 0.6 px web figures, or they vanish under compression.
//
// World: x and y on the floor, z up. Camera at azimuth 45, elevation 30.
// Visible faces of a box: top, +y face ("front"), +x face ("side").

const C = Math.cos(Math.PI / 6);

// "dusk" is the BUCK "airbnb it." inspired look: clay-like materials, warm
// light, soft edges, a tiny world on a seamless backdrop. It is the default.
const DUSK_MAT = {
  wood: { top: "#c99a6b", front: "#a87a50", side: "#8b6240" },
  woodDark: { top: "#9c7150", front: "#7d5638", side: "#65432b" },
  cream: { top: "#f3ebdf", front: "#ddd0bf", side: "#c9b9a5" },
  sage: { top: "#a9bf9f", front: "#8aa180", side: "#728a69" },
  terra: { top: "#e08a68", front: "#c76c4c", side: "#a9563b" },
  charcoal: { top: "#4d4650", front: "#3a343d", side: "#2d282f" },
  brass: { top: "#e7c27a", front: "#c9a15a", side: "#a8823f" },
};

// "sunny" is the full-colour Airbnb-style look: saturated, soft, daylight.
// Same material names as dusk so stations work in both; the colours differ.
const SUNNY_MAT = {
  wood: { top: "#f2b878", front: "#d9955a", side: "#bd7a43" },
  woodDark: { top: "#d38f58", front: "#b8723f", side: "#9a5c30" },
  cream: { top: "#fff8ee", front: "#f6e3cb", side: "#e8cdaa" },
  sage: { top: "#8fdc86", front: "#68c262", side: "#4ea64c" },
  terra: { top: "#ff8f6e", front: "#f26a4d", side: "#d75236" },
  charcoal: { top: "#4b5fa8", front: "#3a4b8c", side: "#2d3b72" },
  brass: { top: "#ffd257", front: "#f5b52c", side: "#da9a14" },
  teal: { top: "#5fd6cf", front: "#33b9b3", side: "#239a96" },
  pink: { top: "#ffa9c9", front: "#f783ad", side: "#dc6690" },
  sky: { top: "#8cc4ff", front: "#62a5f5", side: "#4888da" },
};

export const TONE = {
  sunny: {
    page: "#f9c6a6",
    // Sky keyframes over the episode: morning, afternoon, sunset, twilight.
    sky: [
      ["#c8b8f0", "#f8c9cf", "#ffc39b"],
      ["#a9c8ff", "#ffd1c4", "#ffb98f"],
      ["#9c86e0", "#ff9fb4", "#ff9a68"],
      ["#4b3f9a", "#9a5bb0", "#f27c9b"],
    ],
    clouds: true,
    top: SUNNY_MAT.cream.top, front: SUNNY_MAT.cream.front, side: SUNNY_MAT.cream.side, fill: "#fff8ee",
    edge: "#6a3a2a", edgeAlpha: 0.42, edgeW: 0.6, crease: "#ffffff", creaseAlpha: 0.45, lo: "#b08a74", mid: "#7a5444", hi: "#fff8ee",
    halo: "#7a3a4a", lit: "#5e6ad2", litTop: "#8b95e8", litFront: "#6f7ad8", litSide: "#5e6ad2",
    red: "#ff4d5e", green: "#3fcf7a", amber: "#ffb000", paper: "#fffdf8", mat: SUNNY_MAT,
    hud: { pill: "#ffffff", pillAlpha: 0.9, stroke: "#ffffff", ink: "#2a1a24", sub: "#8a6070", kicker: "#ffffff", capPill: "#ffffff", capInk: "#2a1a24", capLabel: "#5e6ad2" },
    noDesat: true, slamAccent: "#ffd257", hookDim: ["#2a0f3a", 0.4], daylight: true,
  },
  dusk: {
    page: "#2b1f2e", backdrop: ["#7a5468", "#3a2737", "#1e1520"], top: DUSK_MAT.cream.top, front: DUSK_MAT.cream.front, side: DUSK_MAT.cream.side, fill: "#f3ebdf",
    edge: "#3b2a33", edgeAlpha: 0.55, edgeW: 0.6, crease: "#fff8ee", creaseAlpha: 0.35, lo: "#8a7468", mid: "#d8c6b8", hi: "#fff8ee",
    halo: "#14090f", lit: "#8b95e8", litTop: "#8b95e8", litFront: "#6f7ad8", litSide: "#5e6ad2",
    red: "#ff6a5c", green: "#7fd39b", amber: "#ffc266", paper: "#fffaf2", mat: DUSK_MAT,
  },
  dark: {
    page: "#0c0d12", top: "#3a3c45", front: "#2a2c33", side: "#1f2026", fill: "#16171c",
    edge: "#e8e8ee", crease: "#70727c", lo: "#4a4c55", mid: "#8a8c96", hi: "#e8e8ee",
    halo: "#000000", lit: "#8b95e8", litTop: "#5e6ad2", litFront: "#4a55b8", litSide: "#3c4699",
    red: "#ff5a5f", green: "#4fd18b", amber: "#ffb547", paper: "#f2f2ef",
  },
  light: {
    page: "#f1f1fb", top: "#ffffff", front: "#ececf4", side: "#dfdfeb", fill: "#fbfbfe",
    edge: "#26262a", crease: "#b4b4c0", lo: "#b4b4bf", mid: "#8a8a96", hi: "#26262a",
    halo: "#5e6ad2", lit: "#5e6ad2", litTop: "#8b95e8", litFront: "#6f7ad8", litSide: "#5e6ad2",
    red: "#e5484d", green: "#30a46c", amber: "#e09b2d", paper: "#ffffff",
  },
};

/** A camera: origin on screen and pixels per world unit. */
export function camera(ox, oy, s) {
  const p = (x, y, z) => [ox + (x - y) * C * s, oy + (x + y) * 0.5 * s - z * s];
  return { ox, oy, s, p };
}

const f = (n) => n.toFixed(1);
const poly = (cam, pts) => "M" + pts.map(([x, y, z]) => cam.p(x, y, z).map(f).join(" ")).join("L") + "Z";
const path = (cam, pts) => "M" + pts.map(([x, y, z]) => cam.p(x, y, z).map(f).join(" ")).join("L");

/** Depth key: larger is nearer the viewer. Sort ascending to paint back to front. */
export const depth = (x, y, z = 0) => x + y + z * 0.01;

/** Line weight that stays readable at any camera scale. */
const lw = (cam, base = 1) => Math.max(1.2, Math.min(3.2, cam.s * 1.15)) * base;

/**
 * A box from (x, y, z) to (x+w, y+d, z+h).
 * tone: "base" | "lit" | "red" | "paper" | custom {top, front, side}.
 */
export function box(cam, T, x, y, z, w, d, h, { tone = "base", bevel = 0, halo = false, opacity = 1, edge } = {}) {
  if (opacity <= 0.001) return "";
  const pal = typeof tone === "object" ? tone
    : tone === "lit" ? { top: T.litTop, front: T.litFront, side: T.litSide }
    : tone === "red" ? { top: T.red, front: "#c8393e", side: "#a42c31" }
    : tone === "paper" ? { top: T.paper, front: "#e3dccf", side: "#cfc6b7" }
    : T.mat?.[tone] ?? { top: T.top, front: T.front, side: T.side };
  const e = edge ?? (tone === "lit" && !T.mat ? T.lit : T.edge);
  const ea = T.edgeAlpha ?? 1;
  const ew = T.edgeW ?? 1;
  const ca = T.creaseAlpha ?? 1;
  const top = [[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]];
  const front = [[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]];
  const side = [[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]];
  const sil = [[x, y, z + h], [x + w, y, z + h], [x + w, y, z], [x + w, y + d, z], [x, y + d, z], [x, y + d, z + h]];
  let s = `<g opacity="${opacity.toFixed(3)}">`;
  if (halo) s += haloOf(cam, T, x, y, z, w, d);
  s += `<path d="${poly(cam, side)}" fill="${pal.side}"/>`;
  s += `<path d="${poly(cam, front)}" fill="${pal.front}"/>`;
  s += `<path d="${poly(cam, top)}" fill="${pal.top}"/>`;
  // Crease where the top meets the two visible sides, and the vertical corner.
  s += `<path d="${path(cam, [[x, y + d, z + h], [x + w, y + d, z + h], [x + w, y, z + h]])}" stroke="${T.crease}" stroke-opacity="${ca}" stroke-width="${lw(cam, 0.7 * ew)}" fill="none"/>`;
  s += `<path d="${path(cam, [[x + w, y + d, z], [x + w, y + d, z + h]])}" stroke="${T.crease}" stroke-opacity="${ca * 0.6}" stroke-width="${lw(cam, 0.7 * ew)}" fill="none"/>`;
  if (bevel > 0) {
    const b = bevel;
    s += `<path d="${path(cam, [[x + b, y + d - b, z + h], [x + w - b, y + d - b, z + h], [x + w - b, y + b, z + h]])}" stroke="${e}" stroke-opacity="0.35" stroke-width="${lw(cam, 0.6)}" fill="none" stroke-linecap="round"/>`;
  }
  s += `<path d="${poly(cam, sil)}" stroke="${e}" stroke-opacity="${ea}" stroke-width="${lw(cam, ew)}" fill="none" stroke-linejoin="round"/>`;
  return s + "</g>";
}

/** Soft shadow under a footprint. */
export function haloOf(cam, T, x, y, z, w, d, grow = 6) {
  // A contact shadow cast down and toward the viewer, as under a soft key light from the back left.
  const sh = 4;
  const pts = [[x - grow + sh, y - grow + sh, z], [x + w + grow + sh, y - grow + sh, z], [x + w + grow + sh, y + d + grow + sh, z], [x - grow + sh, y + d + grow + sh, z]];
  return `<path d="${poly(cam, pts)}" fill="${T.halo}" opacity="${T.mat ? 0.38 : 0.45}" filter="url(#soft)"/>`;
}

/** Vertical cylinder centred on (cx, cy), from z to z+h. */
export function cylinder(cam, T, cx, cy, r, z, h, { tone = "base", opacity = 1 } = {}) {
  if (opacity <= 0.001) return "";
  const rx = Math.SQRT2 * C * r * cam.s;
  const ry = Math.SQRT2 * 0.5 * r * cam.s;
  const [tx, ty] = cam.p(cx, cy, z + h);
  const [, by] = cam.p(cx, cy, z);
  const lit = tone === "lit";
  const m = T.mat?.[tone];
  const grad = m ? `url(#cyl-${tone})` : lit ? "url(#cylLit)" : tone === "red" ? "url(#cylRed)" : "url(#cylBase)";
  const e = lit && !T.mat ? T.lit : T.edge;
  const topFill = m ? m.top : lit ? T.litTop : tone === "red" ? T.red : T.top;
  const st = `stroke="${e}" stroke-opacity="${T.edgeAlpha ?? 1}" stroke-width="${lw(cam, T.edgeW ?? 1)}"`;
  return `<g opacity="${opacity.toFixed(3)}">`
    + `<path d="M${f(tx - rx)} ${f(ty)}L${f(tx - rx)} ${f(by)}A${f(rx)} ${f(ry)} 0 0 0 ${f(tx + rx)} ${f(by)}L${f(tx + rx)} ${f(ty)}Z" fill="${grad}" ${st}/>`
    + `<ellipse cx="${f(tx)}" cy="${f(ty)}" rx="${f(rx)}" ry="${f(ry)}" fill="${topFill}" ${st}/>`
    + `</g>`;
}

/** A line in world space. */
export function line(cam, T, pts, { tone = "mid", width = 1, dash = "", opacity = 1, cap = "round" } = {}) {
  if (opacity <= 0.001) return "";
  const col = T[tone] ?? tone;
  return `<path d="${path(cam, pts)}" stroke="${col}" stroke-width="${lw(cam, width)}" fill="none" stroke-linecap="${cap}" stroke-linejoin="round" opacity="${opacity.toFixed(3)}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
}

/** Screw dots: small filled circles with a ring, at world points. */
export function screws(cam, T, pts, r = 1.4) {
  return pts.map(([x, y, z]) => {
    const [sx, sy] = cam.p(x, y, z);
    return `<circle cx="${f(sx)}" cy="${f(sy)}" r="${f(r * cam.s * 0.9)}" fill="${T.fill}" stroke="${T.mid}" stroke-width="${lw(cam, 0.6)}"/>`;
  }).join("");
}

/** A filled polygon lying on a face, in world points (screens, labels, inlays). */
export function inlay(cam, pts, fill, { stroke = "none", width = 1, opacity = 1 } = {}) {
  if (opacity <= 0.001) return "";
  return `<path d="${poly(cam, pts)}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" opacity="${opacity.toFixed(3)}"/>`;
}

/** SVG transform that lays local 2D content (u right, v down) on a face.
 *  face "front": plane y = const, u along +x.  "side": plane x = const, u along -y.  "top": plane z = const, u along +x, v along +y. */
export function faceMatrix(cam, face, [x, y, z]) {
  const [ox, oy] = cam.p(x, y, z);
  const s = cam.s;
  if (face === "front") return `matrix(${f(C * s / 1)} ${f(0.5 * s)} 0 ${f(s)} ${f(ox)} ${f(oy)})`;
  if (face === "side") return `matrix(${f(C * s)} ${f(-0.5 * s)} 0 ${f(s)} ${f(ox)} ${f(oy)})`;
  return `matrix(${f(C * s)} ${f(0.5 * s)} ${f(-C * s)} ${f(0.5 * s)} ${f(ox)} ${f(oy)})`;
}

/** Text engraved on a face. Coordinates are local face units. */
export function faceText(cam, face, at, str, { size = 6, fill = "#d4d4d8", weight = 700, anchor = "start", family = "Inter", spacing = 0.3, opacity = 1, dx = 0, dy = 0 } = {}) {
  if (opacity <= 0.001) return "";
  return `<g transform="${faceMatrix(cam, face, at)}"><text x="${dx}" y="${dy}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${spacing}" opacity="${opacity.toFixed(3)}">${String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text></g>`;
}

/** Shared defs every iso frame needs (halo blur, cylinder gradients, glow). */
export function defs(T) {
  return `<defs>
<filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<linearGradient id="cylBase" x1="0" x2="1"><stop offset="0" stop-color="${T.front}"/><stop offset="0.55" stop-color="${T.top}"/><stop offset="1" stop-color="${T.side}"/></linearGradient>
<linearGradient id="cylLit" x1="0" x2="1"><stop offset="0" stop-color="${T.litFront}"/><stop offset="0.55" stop-color="${T.litTop}"/><stop offset="1" stop-color="${T.litSide}"/></linearGradient>
<linearGradient id="cylRed" x1="0" x2="1"><stop offset="0" stop-color="#c8393e"/><stop offset="0.55" stop-color="${T.red}"/><stop offset="1" stop-color="#a42c31"/></linearGradient>
${Object.entries(T.mat ?? {}).map(([k, m]) => `<linearGradient id="cyl-${k}" x1="0" x2="1"><stop offset="0" stop-color="${m.front}"/><stop offset="0.5" stop-color="${m.top}"/><stop offset="1" stop-color="${m.side}"/></linearGradient>`).join("")}
<radialGradient id="vignette" cx="0.5" cy="0.45" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.6"/></radialGradient>
</defs>`;
}
