// Frame-pure runtime for code-only reels.
// Every scene is a function of time, so frame N always renders the same pixels.
// render.mjs drives it through window.__reel.seek(t) and screenshots each frame.

export const W = 1080;
export const H = 1920;

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, k) => a + (b - a) * k;
/** Progress of t through [a, b], clamped to 0..1. */
export const seg = (t, a, b) => clamp((t - a) / (b - a));
/** 0 -> 1 -> 0 window: rises over [a, a+r], holds, falls over [b-r, b]. */
export const win = (t, a, b, r = 0.2) => Math.min(seg(t, a, a + r), 1 - seg(t, b - r, b));

export const ease = {
  linear: (k) => k,
  inCubic: (k) => k * k * k,
  outCubic: (k) => 1 - Math.pow(1 - k, 3),
  inOutCubic: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  outExpo: (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
  inExpo: (k) => (k <= 0 ? 0 : Math.pow(2, 10 * k - 10)),
  outBack: (k) => 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2),
  outElastic: (k) => (k <= 0 ? 0 : k >= 1 ? 1 : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

/** Seeded PRNG (mulberry32). Seed from the episode id so a re-render is identical. */
export function rng(seed) {
  let a = typeof seed === "string" ? [...seed].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0), 7) : seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic smooth noise in -1..1, for camera drift and shake. */
export function wobble(t, seed = 1) {
  return (Math.sin(t * 1.7 + seed) * 0.5 + Math.sin(t * 3.1 + seed * 2.3) * 0.3 + Math.sin(t * 5.3 + seed * 0.7) * 0.2);
}

export function mixHex(a, b, k) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p, s) => (p >> s) & 255;
  const m = (s) => Math.round(lerp(ch(pa, s), ch(pb, s), clamp(k)));
  return `#${((m(16) << 16) | (m(8) << 8) | m(0)).toString(16).padStart(6, "0")}`;
}

export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** SVG text helper. Inter is the brand face (marketing/brands/snap.json). */
export function text(x, y, str, { size = 48, weight = 700, fill = "#fff", anchor = "middle", opacity = 1, spacing = 0, family = "Inter", italic = false, transform = "" } = {}) {
  if (opacity <= 0.001) return "";
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" opacity="${opacity.toFixed(3)}" letter-spacing="${spacing}"${italic ? ' font-style="italic"' : ""}${transform ? ` transform="${transform}"` : ""}>${esc(str)}</text>`;
}

/**
 * Kinetic headline: words rise in one by one.
 * `lines` is an array of strings; a word wrapped in *stars* takes the accent colour.
 */
export function kinetic(t, at, lines, { x = W / 2, y = 700, size = 104, lineGap = 1.12, stagger = 0.09, fill = "#fff", accent = "#8b95e8", weight = 800, out = Infinity, outDur = 0.25 } = {}) {
  let svg = "";
  let i = 0;
  // No exit time means no fade-out (Infinity would make seg() return NaN, which renders as fully visible).
  const fadeOut = Number.isFinite(out) ? 1 - ease.inCubic(seg(t, out, out + outDur)) : 1;
  lines.forEach((line, li) => {
    const words = line.split(" ");
    const widths = words.map((w) => measure(w.replace(/\*/g, ""), size, weight));
    const space = measure(" ", size, weight);
    const total = widths.reduce((a, b) => a + b, 0) + space * (words.length - 1);
    let cx = x - total / 2;
    words.forEach((w, wi) => {
      const k = ease.outBack(seg(t, at + i * stagger, at + i * stagger + 0.38));
      const a = seg(t, at + i * stagger, at + i * stagger + 0.18) * fadeOut;
      const isAccent = w.startsWith("*");
      const word = w.replace(/\*/g, "");
      const yy = y + li * size * lineGap + (1 - k) * size * 0.6;
      svg += text(cx + widths[wi] / 2, yy, word, { size, weight, fill: isAccent ? accent : fill, opacity: a });
      cx += widths[wi] + space;
      i++;
    });
  });
  return svg;
}

let measureCtx = null;
/** Real text width in the page's font, so kinetic words sit where the browser would set them. */
export function measure(str, size, weight = 700) {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  measureCtx.font = `${weight} ${size}px Inter`;
  return measureCtx.measureText(str).width;
}

/** Instagram safe area: keep critical text inside it (top bar, right rail and caption overlay). */
export const SAFE = { top: 250, bottom: 1560, left: 70, right: 960 };
