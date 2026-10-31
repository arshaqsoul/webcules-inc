// Set dressing for the diorama look: puffy clouds on the backdrop and potted
// plants on the tabletop. Small, soft, colourful things that make the scene
// feel lived in, the way the Airbnb dioramas are full of plants and props.

import { cylinder } from "./iso.js";
import { mixHex, wobble } from "./runtime.js";

const f = (n) => n.toFixed(1);

/** One puffy cloud: overlapping circles, a shaded underside, a soft shadow. */
export function cloud(cx, cy, size, tint = "#ffffff", shade = "#f3d6e6", opacity = 1) {
  const blobs = [[-0.55, 0.1, 0.42], [-0.18, -0.18, 0.55], [0.25, -0.05, 0.5], [0.6, 0.15, 0.36], [0.05, 0.2, 0.45]];
  let s = `<g opacity="${opacity.toFixed(3)}">`;
  s += `<ellipse cx="${f(cx + size * 0.06)}" cy="${f(cy + size * 0.42)}" rx="${f(size * 0.95)}" ry="${f(size * 0.12)}" fill="${shade}" opacity="0.35" filter="url(#soft)"/>`;
  for (const [dx, dy, r] of blobs) s += `<circle cx="${f(cx + dx * size)}" cy="${f(cy + dy * size + size * 0.06)}" r="${f(r * size)}" fill="${shade}"/>`;
  for (const [dx, dy, r] of blobs) s += `<circle cx="${f(cx + dx * size - size * 0.03)}" cy="${f(cy + dy * size - size * 0.02)}" r="${f(r * size * 0.94)}" fill="${tint}"/>`;
  return s + "</g>";
}

/** A slow drifting field of clouds; `skyK` (0..1) tints them toward dusk. */
export function cloudField(t, skyK, { seedY = 0, parallaxX = 0 } = {}) {
  const tint = mixHex("#ffffff", "#ffd2e0", Math.min(1, skyK * 1.2));
  const shade = mixHex("#f2d9ec", "#c28bb8", skyK);
  const list = [[140, 330, 120, 0.9], [860, 470, 150, 1.0], [420, 610, 90, 0.75], [980, 210, 80, 0.7], [-40, 760, 110, 0.65]];
  return list.map(([x, y, sz, sp], i) => {
    const drift = ((x + t * 14 * sp - parallaxX * 0.15 + 1400) % 1400) - 160;
    return cloud(drift, y + seedY + wobble(t * 0.3, i) * 6, sz, tint, shade, 0.95);
  }).join("");
}

/** A potted plant at a world point on a surface. kind: "round" | "tall" | "fern". */
export function plant(cam, T, [x, y, z], { kind = "round", pot = "terra", size = 1, t = 0, seed = 0 } = {}) {
  const r = 9 * size;
  let s = cylinder(cam, T, x, y, r, z, 14 * size, { tone: pot });
  s += cylinder(cam, T, x, y, r * 0.86, z + 14 * size - 0.5, 1.5, { tone: "woodDark" });
  const [bx, by] = cam.p(x, y, z + 15 * size);
  const k = cam.s * size;
  const sway = wobble(t * 0.8, seed) * 2;
  const greens = ["#3fae5a", "#58c56a", "#7fdc7c", "#a6ec8f"];
  if (kind === "tall") {
    // A snake plant: upright blades.
    for (let i = -2; i <= 2; i++) {
      const h = (34 + (i % 2) * 8 - Math.abs(i) * 4) * k;
      const x0 = bx + i * 3.4 * k;
      s += `<path d="M${f(x0 - 2.6 * k)} ${f(by)}Q${f(x0 + sway * k * 0.3)} ${f(by - h * 0.6)} ${f(x0 + sway * k * 0.5)} ${f(by - h)}Q${f(x0 + 2 * k + sway * 0.3 * k)} ${f(by - h * 0.55)} ${f(x0 + 2.6 * k)} ${f(by)}Z" fill="${greens[(i + 4) % 4]}"/>`;
    }
  } else if (kind === "fern") {
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.42 + sway * 0.03;
      const L = (22 + (i % 2) * 6) * k;
      const ex = bx + Math.cos(a) * L;
      const ey = by + Math.sin(a) * L * 0.9;
      s += `<path d="M${f(bx)} ${f(by)}Q${f((bx + ex) / 2 + Math.cos(a + 1.2) * 6 * k)} ${f((by + ey) / 2 + Math.sin(a + 1.2) * 6 * k)} ${f(ex)} ${f(ey)}Q${f((bx + ex) / 2 - Math.cos(a + 1.2) * 4 * k)} ${f((by + ey) / 2 - Math.sin(a + 1.2) * 4 * k)} ${f(bx)} ${f(by)}Z" fill="${greens[i % 4]}"/>`;
    }
  } else {
    // A round shrub: clustered leaf balls, darker at the back.
    const balls = [[0, -16, 13, 0], [-9, -10, 9, 1], [9, -11, 10, 1], [-4, -24, 9, 2], [6, -22, 8, 3]];
    for (const [dx, dy, rr, c] of balls) s += `<circle cx="${f(bx + (dx + sway * 0.4) * k)}" cy="${f(by + dy * k)}" r="${f(rr * k)}" fill="${greens[c]}"/>`;
  }
  return s;
}

/** The Snap world's daylight: a bright morning sky with a sun glow and clouds. */
export function daySky(t, { opacity = 1, clouds = true } = {}) {
  let s = `<defs><linearGradient id="daySky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#86c2ff"/><stop offset="0.5" stop-color="#cfd6ff"/><stop offset="1" stop-color="#ffe2ee"/></linearGradient>`;
  s += `<radialGradient id="daySun" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fffbe6" stop-opacity="0.8"/><stop offset="1" stop-color="#fffbe6" stop-opacity="0"/></radialGradient></defs>`;
  s += `<g opacity="${opacity.toFixed(3)}"><rect width="1080" height="1920" fill="url(#daySky)"/><circle cx="820" cy="300" r="480" fill="url(#daySun)"/>`;
  if (clouds) s += cloudField(t, 0, { seedY: -40 });
  return s + "</g>";
}
