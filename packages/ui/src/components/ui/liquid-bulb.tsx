"use client";
import React, { useEffect, useRef, useState } from "react";
import { cn } from "@webcules/ui/lib/utils";

/**
 * LiquidBulb — a liquid-glass sphere wrapped in drifting iridescent ribbon
 * loops, pure canvas 2D.
 *
 * `bands` thick glass ribbons share one tilted orbital axis around a milky
 * sphere. Each loop slides around its orbit at its own (occasionally
 * counter-drifting) rate, so the swirl reads as liquid slowly revolving inside
 * a glass shell. Ribbons carry a milky translucent body, a spectral fringe
 * that rides their folds, hard specular streaks where they face the upper-left
 * light, and a dark crease on the shadow side — the thin-film glass look.
 * Back-of-orbit ribbon halves are painted first, dimmed under the shell's
 * frosted body, then the front halves overlap them; shell passes add the inner
 * rim shadow, chromatic edge fringe, rim-light arc and broad sheen, and a soft
 * contact shadow grounds the sphere.
 *
 * Everything renders on a low-resolution offscreen buffer upscaled with
 * smoothing (`softness` controls the blur — push it high for the defocused
 * "aura" look). Zero runtime dependencies, deterministic (sin-hash from
 * `seed`), decorative (`aria-hidden`), reduced-motion safe.
 */

export interface LiquidBulbProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Iridescent ramp walked along each ribbon — CSS colors, or one
   *  comma-separated string for configs and snippets. */
  colors?: string[] | string;
  /** Canvas backdrop color; "transparent" lets the page show through. */
  background?: string;
  /** Sphere diameter as a fraction of the shorter side (0.2–0.95). */
  size?: number;
  /** Ribbon loops wrapped around the sphere (1–6). */
  bands?: number;
  /** Tilt of the shared orbital axis, in degrees. */
  tilt?: number;
  /** Orbit drift rate; 0 = frozen. */
  speed?: number;
  /** Per-loop radius/inclination variation and counter-drift (0–1). */
  swirl?: number;
  /** Milky body opacity of the glass (0–1). */
  frost?: number;
  /** Spectral fringe strength (0–1). */
  iridescence?: number;
  /** Specular streak + sheen strength (0–1). */
  gloss?: number;
  /** Upscale blur (0–1); high values give the defocused aura look. */
  softness?: number;
  /** Contact shadow under the sphere (0–1). */
  shadow?: number;
  /** Film-grain overlay (0–1); needs a background color to sit on. */
  grain?: number;
  /** Global zoom of the composition. */
  scale?: number;
  /** Sphere center, 0–1 of the canvas. */
  origin?: { x: number; y: number };
  /** The sphere tilts subtly toward the pointer. */
  interactive?: boolean;
  /** Deterministic variation — same seed, same bulb. */
  seed?: number;
}

type RGB = [number, number, number];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const fract = (v: number) => ((v % 1) + 1) % 1;
const RAD = Math.PI / 180;

function hash(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const mixChannel = (a: number, b: number, t: number) => Math.round(a + (b - a) * clamp01(t));
const mixRgb = (a: RGB, b: RGB, t: number): RGB => [
  mixChannel(a[0], b[0], t),
  mixChannel(a[1], b[1], t),
  mixChannel(a[2], b[2], t),
];
/** Push a color away from its own luma — pastel palettes need bite in the fringes. */
const saturate = (c: RGB, k = 1.6): RGB => {
  const luma = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  const ch = (v: number) => Math.min(255, Math.max(0, Math.round(luma + (v - luma) * k)));
  return [ch(c[0]), ch(c[1]), ch(c[2])];
};
const rgba = (c: RGB, a: number) =>
  `rgba(${c[0]},${c[1]},${c[2]},${clamp01(a).toFixed(3)})`;

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

/** Fallback ramp — the shipped jewel-tone spectral film. */
const FALLBACK_RAMP: RGB[] = [
  [186, 23, 102],
  [0, 137, 179],
  [22, 60, 212],
  [119, 74, 201],
  [223, 48, 123],
];

let probeCtx: CanvasRenderingContext2D | null = null;
const colorCache = new Map<string, RGB>();

/** Any CSS color → RGB. Hex takes the fast path; everything else goes through a 1×1 probe. */
function normalizeColor(spec: string): RGB | null {
  const cached = colorCache.get(spec);
  if (cached) return cached;
  let out: RGB | null = null;
  const hex = spec.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) {
    const v =
      hex.length === 4
        ? hex
            .slice(1)
            .split("")
            .map((c) => c + c)
            .join("")
        : hex.slice(1);
    const n = parseInt(v, 16);
    out = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  } else if (typeof document !== "undefined") {
    if (!probeCtx) {
      const probe = document.createElement("canvas");
      probe.width = probe.height = 1;
      probeCtx = probe.getContext("2d", { willReadFrequently: true });
    }
    if (probeCtx) {
      probeCtx.clearRect(0, 0, 1, 1);
      probeCtx.fillStyle = spec;
      probeCtx.fillRect(0, 0, 1, 1);
      const d = probeCtx.getImageData(0, 0, 1, 1).data;
      // an unparseable color leaves the pixel untouched (transparent) — treat as invalid
      if (d[3]! > 0) out = [d[0]!, d[1]!, d[2]!];
    }
  }
  if (out) colorCache.set(spec, out);
  return out;
}

/** Sample the color ramp at 0–1 (stops lerped, clamped at the ends). */
function sampleRamp(ramp: RGB[], t: number): RGB {
  if (ramp.length === 0) return FALLBACK_RAMP[0]!;
  if (ramp.length === 1) return ramp[0]!;
  const x = clamp01(t) * (ramp.length - 1);
  const i = Math.min(Math.floor(x), ramp.length - 2);
  return mixRgb(ramp[i]!, ramp[i + 1]!, x - i);
}

/** One projected ribbon sample, depth-sorted so back halves paint first. */
interface Sample {
  x: number;
  y: number;
  rot: number;
  nx: number;
  ny: number;
  hw: number;
  z: number;
  lam: number;
  col: RGB;
  u: number;
  phase: number;
  li: number;
  fade: number;
}

export const LiquidBulb = React.forwardRef<HTMLDivElement, LiquidBulbProps>(
  (
    {
      className,
      colors = ["#ba1766", "#0089b3", "#163cd4", "#774ac9", "#df307b"],
      background = "#ffffff",
      size = 0.85,
      bands = 3,
      tilt = -63,
      speed = 0.6,
      swirl = 1,
      frost = 1,
      iridescence = 0.85,
      gloss = 0.8,
      softness = 0.65,
      shadow = 0.4,
      grain = 0,
      scale = 1,
      origin = { x: 0.5, y: 0.5 },
      interactive = false,
      seed = 1,
      ...rest
    },
    ref,
  ) => {
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [reduced, setReduced] = useState(false);

    // the RAF loop reads the latest props through this ref — no re-subscription on tweaks
    const propsRef = useRef({
      colors, background, size, bands, tilt, speed, swirl, frost, iridescence,
      gloss, softness, shadow, grain, scale, origin, interactive, seed, reduced,
    });
    propsRef.current = {
      colors, background, size, bands, tilt, speed, swirl, frost, iridescence,
      gloss, softness, shadow, grain, scale, origin, interactive, seed, reduced,
    };

    useEffect(() => {
      const wrap = wrapRef.current;
      const canvas = canvasRef.current;
      if (!wrap || !canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const off = document.createElement("canvas");
      const offCtx = off.getContext("2d");
      const off2 = document.createElement("canvas");
      const off2Ctx = off2.getContext("2d");
      if (!offCtx || !off2Ctx) return;

      let w = 0;
      let h = 0;
      let raf = 0;
      let running = true;
      let T = 0;
      let last = performance.now();
      const pointer = { x: 0, y: 0, tx: 0, ty: 0 }; // eased + target, -0.5…0.5

      // deterministic grain tile, rebuilt only when the seed changes
      let grainTile: HTMLCanvasElement | null = null;
      let grainSeedUsed = -1;
      const grainPattern = (s: number) => {
        if (grainTile && grainSeedUsed === s) return grainTile;
        const tile = document.createElement("canvas");
        tile.width = tile.height = 96;
        const tctx = tile.getContext("2d");
        if (tctx) {
          const img = tctx.createImageData(96, 96);
          for (let p = 0; p < img.data.length; p += 4) {
            const v = 108 + Math.round(90 * hash(p / 4, s + 77));
            img.data[p] = img.data[p + 1] = img.data[p + 2] = v;
            img.data[p + 3] = 255;
          }
          tctx.putImageData(img, 0, 0);
        }
        grainTile = tile;
        grainSeedUsed = s;
        return tile;
      };

      const resize = () => {
        const r = wrap.getBoundingClientRect();
        w = Math.max(r.width, 1);
        h = Math.max(r.height, 1);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        // render buffer: ~560 px on the short side — keeps the sphere rim and
        // specular threads crisp after the upscale, cost still trivial
        const k = Math.min(1, 560 / Math.min(w, h));
        off.width = off2.width = Math.max(2, Math.round(w * k));
        off.height = off2.height = Math.max(2, Math.round(h * k));
        render();
      };

      const render = () => {
        const p = propsRef.current;
        const octx = offCtx!;
        const OK = off.width, OH = off.height;
        const k = OK / w; // css px → buffer px

        octx.setTransform(1, 0, 0, 1, 0, 0);
        octx.globalCompositeOperation = "source-over";
        octx.globalAlpha = 1;
        octx.clearRect(0, 0, OK, OH);
        // geometry is authored in CSS px; the buffer is a fraction of that
        octx.setTransform(k, 0, 0, k, 0, 0);
        if (p.background !== "transparent") {
          octx.fillStyle = p.background;
          octx.fillRect(0, 0, w, h);
        }

        const breathe = 1 + 0.008 * Math.sin(T * 0.7);
        const R = Math.max(8, p.size * p.scale * Math.min(w, h) * 0.5) * breathe;
        const cx = p.origin.x * w;
        const cy = p.origin.y * h;

        // key light: upper-left, toward the viewer
        const Lx = -0.45, Ly = 0.62, Lz = 0.645;
        // light direction on screen (canvas y is flipped) — offsets speculars/creases
        const lsx = -0.58, lsy = -0.82;

        // contact shadow, grounded under the sphere
        if (p.shadow > 0.01) {
          const sy = cy + R * 1.04;
          octx.save();
          octx.translate(cx, sy);
          octx.scale(1, 0.17);
          const gSh = octx.createRadialGradient(0, 0, 0, 0, 0, R * 0.92);
          gSh.addColorStop(0, rgba(BLACK, p.shadow * 0.3));
          gSh.addColorStop(0.55, rgba(BLACK, p.shadow * 0.14));
          gSh.addColorStop(1, rgba(BLACK, 0));
          octx.fillStyle = gSh;
          octx.beginPath();
          octx.arc(0, 0, R * 0.92, 0, Math.PI * 2);
          octx.fill();
          octx.restore();
        }

        const bgCol = normalizeColor(p.background);
        const bgLuma = bgCol ? 0.3 * bgCol[0] + 0.59 * bgCol[1] + 0.11 * bgCol[2] : 255;
        // white milk disappears on a white backdrop — on light backdrops the
        // glass picks up a cool gray so the sphere body actually reads
        const milk = bgLuma < 140 ? WHITE : mixRgb(WHITE, [205, 210, 224], 0.45);

        const colorList = Array.isArray(p.colors)
          ? p.colors
          : String(p.colors).split(",").map((c) => c.trim()).filter(Boolean);
        const ramp = colorList.map(normalizeColor).filter((c): c is RGB => c !== null);
        const palette = ramp.length > 0 ? ramp : FALLBACK_RAMP;

        // ONE continuous spiral wound pole-to-pole around the sphere, rotating
        // as a single rigid body. That is what makes the reference's motion
        // perfectly smooth — the whole texture turns together. Independent
        // loops each precessing at their own rate slide against themselves and
        // read as jittering tubes floating outside the ball.
        const turns = Math.max(1, Math.min(6, Math.round(p.bands))) * 1.6;
        const M = 150; // samples along the one spiral
        const bandW = 0.21 * (0.85 + 0.3 * clamp01(p.frost));
        const spin = T * p.speed * 0.4; // the single rotation everything shares
        // the polar axis leans by `tilt` in the screen plane + a gentle yaw wobble
        const roll = p.tilt * RAD + (p.interactive ? pointer.x * 0.4 : 0);
        const rollC = Math.cos(roll);
        const rollS = Math.sin(roll);
        const yaw = Math.sin(T * 0.11) * 0.12 + (p.interactive ? pointer.y * 0.3 : 0);
        const cosB = Math.cos(yaw);
        const sinB = Math.sin(yaw);

        const samples: Sample[] = [];
        const loopMeta: { i: number; rF: number }[] = [{ i: 0, rF: 1 }];

        for (let j = 0; j <= M; j++) {
          const u = j / M;
          const phiPre = (u - 0.5) * Math.PI;
          if (Math.abs(phiPre) > 0.46 * Math.PI) continue; // poles: windings pile onto one point
          // winding: latitude climbs south → north while the longitude spins
          const phi = phiPre;
          const theta =
            spin + u * turns * Math.PI * 2 +
            p.swirl * 0.3 * Math.sin(u * 9 + T * 0.4); // liquid waviness
          const cph = Math.cos(phi);
          // point on the unit sphere (y up)
          const x0 = cph * Math.cos(theta);
          const y0 = Math.sin(phi);
          const z0 = cph * Math.sin(theta);
          // gentle yaw around the vertical, then lean the axis in screen plane
          const x1 = x0 * cosB + z0 * sinB;
          const z1 = -x0 * sinB + z0 * cosB;
          const sx = x1 * rollC - y0 * rollS;
          const sy = x1 * rollS + y0 * rollC;
          const px = cx + R * sx;
          const py = cy - R * sy;
          const z = z1;
          // neighbor a step ahead for the tangent → stamp rotation
          const u2 = u + 0.004;
          const phi2 = (u2 - 0.5) * Math.PI;
          const theta2 =
            spin + u2 * turns * Math.PI * 2 +
            p.swirl * 0.3 * Math.sin(u2 * 9 + T * 0.4);
          const c2 = Math.cos(phi2);
          const x02 = c2 * Math.cos(theta2);
          const y02 = Math.sin(phi2);
          const z02 = c2 * Math.sin(theta2);
          const x12 = x02 * cosB + z02 * sinB;
          const px2 = cx + R * (x12 * rollC - y02 * rollS);
          const py2 = cy - R * (x12 * rollS + y02 * rollC);
          const rot = Math.atan2(py2 - py, px2 - px) || 0;
          // key light on the surface normal — the rolled screen basis (y up)
          const lam = Math.max(0, sx * Lx + sy * Ly + z * Lz);
          // spectral bands sit ON the ball and rotate with it
          const col = sampleRamp(palette, fract(theta / (Math.PI * 2) * 0.6 + 0.1));
          // folds lie ON the sphere — taper just inside the silhouette
          const rProj = Math.hypot(px - cx, py - cy) / R;
          const fade = clamp01(1 - (rProj - 0.96) / 0.1);
          // apparent width: view foreshortening × pole taper × slight flare
          const poleTaper = 0.4 + 0.6 * cph;
          const flare = 0.8 + 0.2 * Math.sin(theta * 3 + u * 12);
          samples.push({
            x: px,
            y: py,
            rot,
            nx: -Math.sin(rot),
            ny: Math.cos(rot),
            hw: R * bandW * (0.35 + 0.65 * Math.abs(z)) * poleTaper * flare,
            z,
            lam,
            col,
            u,
            phase: spin * 0.5,
            li: 0,
            fade,
          });
        }
        // far side of the spiral first — the shell dims it behind the glass
        samples.sort((a, b) => a.z - b.z);

        // one elongated soft ellipse; gradient centers live in the stamp's LOCAL
        // space — a center at (px,py) would land at 2·(px,py) after the translate
        const stamp = (
          ox: number, oy: number, rot: number, r: number,
          g: CanvasGradient, elong: number,
        ) => {
          octx.save();
          octx.translate(ox, oy);
          octx.rotate(rot);
          octx.scale(elong, 1);
          octx.fillStyle = g;
          octx.beginPath();
          octx.arc(0, 0, r, 0, Math.PI * 2);
          octx.fill();
          octx.restore();
        };

        const SLATE: RGB = [52, 54, 66];

        // pass 1 — soft volume: glass body, traveling tint, dark underside
        const paintBody = (sm: Sample) => {
          const front = sm.z >= 0;
          const mult = front ? 1 : 0.3; // back halves read through the glass, not as separate faint tubes
          const depthFace = 0.55 + 0.45 * Math.abs(sm.z);

          const litSide = sm.nx * lsx + sm.ny * lsy >= 0 ? 1 : -1;

          // glass folds read through VALUE, not color: cool gray on the
          // shadow side, bleaching to white where the key light lands — the
          // palette arrives only as the iridescent edge fringes
          const bodyA = p.frost * 1.05 * mult * depthFace * sm.fade;
          const bodyCol = mixRgb([223, 226, 236], WHITE, clamp01(sm.lam * 1.2));
          const gBody = octx.createRadialGradient(0, 0, sm.hw * 0.04, 0, 0, sm.hw);
          gBody.addColorStop(0, rgba(bodyCol, bodyA));
          gBody.addColorStop(0.55, rgba(bodyCol, bodyA * 0.95));
          gBody.addColorStop(0.88, rgba(bodyCol, bodyA * 0.5));
          gBody.addColorStop(1, rgba(bodyCol, 0));
          stamp(sm.x, sm.y, sm.rot, sm.hw, gBody, 1.7);

          if (!front) return; // back halves skip the lighting detail

          // dark underside — the shadow half that rounds the tube
          const shadeA = p.frost * 0.55 * (1 - sm.lam * 0.6);
          if (shadeA > 0.02) {
            const shadeCol = mixRgb(sm.col, SLATE, 0.72);
            const gShade = octx.createRadialGradient(0, 0, 0, 0, 0, sm.hw * 0.6);
            gShade.addColorStop(0, rgba(shadeCol, shadeA));
            gShade.addColorStop(1, rgba(shadeCol, 0));
            stamp(
              sm.x - sm.nx * litSide * sm.hw * 0.45,
              sm.y - sm.ny * litSide * sm.hw * 0.45,
              sm.rot, sm.hw * 0.6, gShade, 1.6,
            );
          }

          // broad reflection — the lit half lifts toward white
          if (p.gloss > 0.03 && sm.lam > 0.03) {
            const liftCol = mixRgb(sm.col, WHITE, 0.8);
            const liftA = p.gloss * 0.32 * sm.lam;
            const gLift = octx.createRadialGradient(0, 0, 0, 0, 0, sm.hw * 0.5);
            gLift.addColorStop(0, rgba(liftCol, liftA));
            gLift.addColorStop(1, rgba(liftCol, 0));
            stamp(
              sm.x + sm.nx * litSide * sm.hw * 0.18,
              sm.y + sm.ny * litSide * sm.hw * 0.18,
              sm.rot, sm.hw * 0.5, gLift, 1.9,
            );
          }
        };

        // pass 2 — the soft structure: fold shading, lit sheen, spectral fringes
        const strokeLoop = (li: number) => {
          const pts = samples.filter((sm) => sm.li === li && sm.z >= 0).sort((a, b) => a.u - b.u);
          if (pts.length < 2) return;
          // split where the arc passed behind the sphere (u gap)
          const segs: Sample[][] = [];
          let cur: Sample[] = [];
          for (const sm of pts) {
            const lastU = cur.length > 0 ? cur[cur.length - 1]!.u : -1;
            if (cur.length > 0 && sm.u - lastU > 2.5 / M) {
              segs.push(cur);
              cur = [];
            }
            cur.push(sm);
          }
          if (cur.length > 0) segs.push(cur);

          for (const seg of segs) {
            if (seg.length < 2) continue;
            // smooth the polyline — the liquid wobble otherwise beads the strokes
            // into dotted lines
            const line: Sample[] = seg.map((s, idx) => {
              let sx = 0, sy = 0, snx = 0, sny = 0, shw = 0, n = 0;
              for (let k = -2; k <= 2; k++) {
                const nb = seg[idx + k];
                if (!nb) continue;
                sx += nb.x; sy += nb.y; snx += nb.nx; sny += nb.ny; shw += nb.hw; n++;
              }
              return { ...s, x: sx / n, y: sy / n, nx: snx / n, ny: sny / n, hw: shw / n };
            });

            // paint in overlapping chunks; each stroke takes a GRADIENT whose
            // stops sample the patch function per-sample, so color, folds and
            // sheen vary continuously along the ribbon — a constant stroke
            // down the whole arc reads as a solid pipe, and constant-alpha
            // chunks would stack like bricks
            const CHUNK = 9;
            for (let c0 = 0; c0 < line.length - 1; c0 += CHUNK - 2) {
              const chunk = line.slice(c0, c0 + CHUNK);
              if (chunk.length < 4) break;
              const mid = chunk[Math.floor(chunk.length / 2)]!;
              const litSide = mid.nx * lsx + mid.ny * lsy >= 0 ? 1 : -1;
              const hwA = chunk.reduce((t, sm) => t + sm.hw, 0) / chunk.length;
              const lamA = chunk.reduce((t, sm) => t + sm.lam, 0) / chunk.length;
              const fadeA = chunk.reduce((t, sm) => t + sm.fade, 0) / chunk.length;

              // stroke whose color/alpha drifts along the arc
              const gradStroke = (
                offF: number, width: number,
                colorAt: (u: number) => string,
              ) => {
                const p0 = chunk[0]!;
                const pN = chunk[chunk.length - 1]!;
                const g = octx.createLinearGradient(
                  p0.x + p0.nx * offF * p0.hw, p0.y + p0.ny * offF * p0.hw,
                  pN.x + pN.nx * offF * pN.hw, pN.y + pN.ny * offF * pN.hw,
                );
                for (let s = 0; s <= 4; s++) {
                  const sm = chunk[Math.min(chunk.length - 1, Math.round((s / 4) * (chunk.length - 1)))]!;
                  g.addColorStop(s / 4, colorAt(sm.u));
                }
                octx.strokeStyle = g;
                octx.lineWidth = width;
                octx.lineJoin = "round";
                octx.lineCap = "round";
                octx.beginPath();
                chunk.forEach((sm, idx) => {
                  const ox = sm.x + sm.nx * offF * sm.hw;
                  const oy = sm.y + sm.ny * offF * sm.hw;
                  if (idx === 0) octx.moveTo(ox, oy);
                  else octx.lineTo(ox, oy);
                });
                octx.stroke();
              };

              // spectral fringes riding the ribbon faces — patchy, like a
              // thin-film reflection, not a painted stripe
              if (p.iridescence > 0.03) {
                gradStroke(litSide * 0.28, Math.max(hwA * 0.62, 2), (u) => {
                  const patch = 0.5 + 0.5 * Math.sin(u * 3.5 + mid.phase * 3 + T * 0.4);
                  return rgba(
                    saturate(sampleRamp(palette, fract(u * 3 + mid.phase * 0.2 + 0.33))),
                    p.iridescence * 0.55 * fadeA * (0.4 + 0.6 * patch),
                  );
                });
                gradStroke(-litSide * 0.32, Math.max(hwA * 0.62, 2), (u) => {
                  const patch = 0.5 + 0.5 * Math.sin(u * 3.5 + mid.phase * 3 + T * 0.4);
                  return rgba(
                    saturate(sampleRamp(palette, fract(u * 3 + mid.phase * 0.2 + 0.72))),
                    p.iridescence * 0.47 * fadeA * (0.4 + 0.6 * patch),
                  );
                });
              }

              // soft fold shading on the edges — appears where the ribbon bends
              // away from the light, fades where it runs flat
              const foldBase = (0.22 + 0.26 * p.gloss) * (1 - 0.3 * lamA);
              const foldCol = mixRgb(mid.col, SLATE, 0.78);
              gradStroke(-litSide * 0.86, Math.max(hwA * 0.3, 3), (u) => {
                const patch = 0.5 + 0.5 * Math.sin(u * 3.5 + mid.phase * 3 + T * 0.4);
                return rgba(foldCol, foldBase * fadeA * (0.25 + 0.55 * patch));
              });
              gradStroke(litSide * 0.86, Math.max(hwA * 0.24, 2.5), (u) => {
                const patch = 0.5 + 0.5 * Math.sin(u * 3.5 + mid.phase * 3 + T * 0.4);
                return rgba(foldCol, foldBase * 0.14 * fadeA * (0.3 + 0.5 * patch));
              });

              // bold glossy streak riding the lit fold — the highlight that
              // makes the folds read as glossy glass, not tubes
              if (p.gloss > 0.03 && lamA > 0.05) {
                gradStroke(litSide * 0.45, Math.max(hwA * 0.34, 2.5), (u) => {
                  const patch = 0.5 + 0.5 * Math.sin(u * 3.5 + mid.phase * 3 + T * 0.4);
                  return rgba(WHITE, p.gloss * 0.75 * lamA * fadeA * (0.25 + 0.75 * patch));
                });
                gradStroke(litSide * 0.72, Math.max(hwA * 0.2, 2), (u) => {
                  const patch = 0.5 + 0.5 * Math.sin(u * 3.5 + mid.phase * 3 + T * 0.4);
                  return rgba(WHITE, p.gloss * 0.35 * lamA * fadeA * (0.3 + 0.7 * patch));
                });
              }
            }
          }
        };

        // pass 3 — specular beads that shimmer as the loop drifts through the
        // light; a constant full-alpha line would read as a painted stripe
        const paintSpec = (sm: Sample) => {
          if (p.gloss <= 0.03 || sm.lam <= 0.05) return;
          const litSide = sm.nx * lsx + sm.ny * lsy >= 0 ? 1 : -1;
          const shimmer = 0.55 + 0.45 * Math.sin(sm.u * 12 + T * 0.6 + sm.phase);
          const specR = Math.max(sm.hw * 0.22, 0.8);
          const specA = Math.pow(p.gloss, 1.2) * 0.85 * shimmer * sm.lam * Math.abs(sm.z) * sm.fade;
          const gSpec = octx.createRadialGradient(0, 0, 0, 0, 0, specR);
          gSpec.addColorStop(0, rgba(WHITE, specA));
          gSpec.addColorStop(0.5, rgba(WHITE, specA * 0.45));
          gSpec.addColorStop(1, rgba(WHITE, 0));
          stamp(
            sm.x + sm.nx * litSide * sm.hw * 0.42,
            sm.y + sm.ny * litSide * sm.hw * 0.42,
            sm.rot, specR, gSpec, 3.0,
          );
        };

        for (const sm of samples) if (sm.z < 0) paintBody(sm);

        // shell: frosted glass body the back ribbons show through
        const gShell = octx.createRadialGradient(
          cx - R * 0.22, cy - R * 0.28, R * 0.1, cx, cy, R * 1.05,
        );
        gShell.addColorStop(0, rgba(milk, p.frost * 0.32));
        gShell.addColorStop(0.7, rgba(milk, p.frost * 0.16));
        gShell.addColorStop(1, rgba(milk, p.frost * 0.2));
        octx.fillStyle = gShell;
        octx.beginPath();
        octx.arc(cx, cy, R, 0, Math.PI * 2);
        octx.fill();

        // form shadow — the interior falls off toward the lower right
        const gForm = octx.createRadialGradient(
          cx + R * 0.42, cy + R * 0.5, 0, cx + R * 0.42, cy + R * 0.5, R * 0.95,
        );
        gForm.addColorStop(0, rgba(SLATE, p.frost * (bgLuma < 140 ? 0.08 : 0.16)));
        gForm.addColorStop(1, rgba(SLATE, 0));
        octx.fillStyle = gForm;
        octx.beginPath();
        octx.arc(cx, cy, R, 0, Math.PI * 2);
        octx.fill();

        // inner rim shadow — the glass thickens at the silhouette
        const gRim = octx.createRadialGradient(cx, cy, R * 0.78, cx, cy, R * 0.99);
        gRim.addColorStop(0, rgba(BLACK, 0));
        gRim.addColorStop(1, rgba(BLACK, 0.12 + p.frost * 0.08));
        octx.fillStyle = gRim;
        octx.beginPath();
        octx.arc(cx, cy, R, 0, Math.PI * 2);
        octx.fill();

        for (const sm of samples) if (sm.z >= 0) paintBody(sm);
        // crisp structure painted inner loop → outer, so outer ribbons overlap
        for (const { i } of [...loopMeta].sort((a, b) => a.rF - b.rF)) strokeLoop(i);
        for (const sm of samples) if (sm.z >= 0) paintSpec(sm);

        // chromatic dispersion fringing the silhouette
        if (p.iridescence > 0.03) {
          octx.lineWidth = Math.max(R * 0.02, 1);
          octx.strokeStyle = rgba([255, 128, 170], p.iridescence * 0.09);
          octx.beginPath();
          octx.arc(cx, cy, R * 0.99, 0, Math.PI * 2);
          octx.stroke();
          octx.strokeStyle = rgba([150, 220, 255], p.iridescence * 0.08);
          octx.beginPath();
          octx.arc(cx, cy, R * 0.965, 0, Math.PI * 2);
          octx.stroke();
        }

        // broad sheen + rim-light arc from the upper-left key light
        if (p.gloss > 0.03) {
          const gSheen = octx.createRadialGradient(
            cx - R * 0.35, cy - R * 0.42, 0, cx - R * 0.35, cy - R * 0.42, R * 0.75,
          );
          gSheen.addColorStop(0, rgba(WHITE, p.gloss * 0.3));
          gSheen.addColorStop(1, rgba(WHITE, 0));
          octx.fillStyle = gSheen;
          octx.beginPath();
          octx.arc(cx, cy, R, 0, Math.PI * 2);
          octx.fill();

          octx.lineCap = "round";
          octx.lineWidth = Math.max(R * 0.05, 1.5);
          octx.strokeStyle = rgba(WHITE, p.gloss * 0.12);
          octx.beginPath();
          octx.arc(cx, cy, R * 0.97, Math.PI * 1.02, Math.PI * 1.62);
          octx.stroke();
          octx.lineWidth = Math.max(R * 0.016, 1);
          octx.strokeStyle = rgba(WHITE, p.gloss * 0.5);
          octx.beginPath();
          octx.arc(cx, cy, R * 0.975, Math.PI * 1.08, Math.PI * 1.58);
          octx.stroke();
        }

        octx.setTransform(1, 0, 0, 1, 0, 0);
        octx.globalCompositeOperation = "source-over";

        // film grain
        if (p.grain > 0 && p.background !== "transparent") {
          const tile = grainPattern(p.seed);
          if (tile) {
            const pat = octx.createPattern(tile, "repeat");
            if (pat) {
              octx.globalAlpha = p.grain * 0.16;
              octx.globalCompositeOperation = "overlay";
              octx.fillStyle = pat;
              octx.fillRect(0, 0, OK, OH);
              octx.globalAlpha = 1;
              octx.globalCompositeOperation = "source-over";
            }
          }
        }

        // upscale via a blur at the small buffer scale, then a clean draw —
        // filtering the full-size canvas every frame is by far the costliest
        // op here and looks identical
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        off2Ctx.setTransform(1, 0, 0, 1, 0, 0);
        off2Ctx.clearRect(0, 0, OK, OH);
        const blurPx = (0.5 + clamp01(p.softness) * 2.0) * k;
        if (blurPx > 0.2) off2Ctx.filter = `blur(${blurPx.toFixed(2)}px)`;
        off2Ctx.drawImage(off, 0, 0);
        off2Ctx.filter = "none";
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(off2, 0, 0, canvas.width, canvas.height);
      };

      let acc = 0;
      let renderCost = 8; // ms, EMA of the last render pass
      const tick = (now: number) => {
        if (!running) return;
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        T += dt * Math.max(propsRef.current.speed, 0) * 0.55;
        // ease the pointer tilt toward its target
        pointer.x += (pointer.tx - pointer.x) * 0.06;
        pointer.y += (pointer.ty - pointer.y) * 0.06;
        // adaptive pacing: 60fps while the machine sustains it, 30 when
        // frames run long — judder reads worse than a lower steady rate
        acc += dt;
        const target = renderCost > 17 ? 1 / 30 : 1 / 60;
        if (acc >= target) {
          acc = 0;
          const t0 = performance.now();
          render();
          renderCost += (performance.now() - t0 - renderCost) * 0.2;
        }
        raf = requestAnimationFrame(tick);
      };
      const start = () => {
        if (running || propsRef.current.reduced) return;
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(tick);
      };
      const stop = () => {
        running = false;
        cancelAnimationFrame(raf);
      };
      const onVis = () => (document.hidden ? stop() : start());

      const ro = new ResizeObserver(resize);
      ro.observe(wrap);
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      const onMq = () => setReduced(mq.matches);
      onMq();
      mq.addEventListener("change", onMq);
      document.addEventListener("visibilitychange", onVis);

      const onPointer = (e: PointerEvent) => {
        if (!propsRef.current.interactive) return;
        const r = wrap.getBoundingClientRect();
        pointer.tx = clamp01((e.clientX - r.left) / Math.max(r.width, 1)) - 0.5;
        pointer.ty = clamp01((e.clientY - r.top) / Math.max(r.height, 1)) - 0.5;
      };
      const onPointerLeave = () => {
        pointer.tx = 0;
        pointer.ty = 0;
      };
      wrap.addEventListener("pointermove", onPointer);
      wrap.addEventListener("pointerleave", onPointerLeave);

      resize();
      if (propsRef.current.reduced) {
        T = 2.4; // one settled static frame
        render();
      } else {
        raf = requestAnimationFrame(tick);
      }

      return () => {
        stop();
        ro.disconnect();
        mq.removeEventListener("change", onMq);
        document.removeEventListener("visibilitychange", onVis);
        wrap.removeEventListener("pointermove", onPointer);
        wrap.removeEventListener("pointerleave", onPointerLeave);
      };
    }, []);

    return (
      <div
        {...rest}
        ref={(node) => {
          wrapRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        aria-hidden="true"
        className={cn("relative overflow-hidden", className)}
        style={{ background: background === "transparent" ? undefined : background, ...rest.style }}
      >
        <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 block h-full w-full" />
      </div>
    );
  },
);
LiquidBulb.displayName = "LiquidBulb";

export default LiquidBulb;
