"use client";
import React, { useEffect, useRef, useState } from "react";
import { cn } from "@webcules/ui/lib/utils";

/**
 * CardTrain — an endless train of tilting cards flowing along a wave, pure
 * canvas 2D.
 *
 * A single file of rounded-square cards travels continuously across the canvas
 * along a traveling sine wave, each card overlapping the previous one so the
 * train reads as one flowing ribbon of card edges. Every card's 3D pose is
 * phase-locked to its position on the wave — it yaws through a flip and pitches
 * over crests as it travels — so the train "swims" like cards dealt along a
 * rollercoaster track. Cards are projected with a hand-rolled perspective
 * (rotate → project the rounded-rect outline → fill path): crests sit closer
 * and render larger, troughs recede and dim toward the background. A sparse
 * layer of drifting confetti squares gives the page air; most sit behind the
 * train, a few drift in front.
 *
 * Zero runtime dependencies, deterministic (sin-hash), decorative
 * (`aria-hidden`), reduced-motion safe (one settled static frame).
 */

export interface CardTrainProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Per-card color cycle — CSS colors, or one comma-separated string for
   *  configs and snippets. */
  colors?: string[] | string;
  /** Canvas backdrop color; "transparent" lets the page show through. */
  background?: string;
  /** Base card edge in px (auto-scales down on narrow containers). */
  cardSize?: number;
  /** Minimum cards in the stream — auto-raised to fill the width. */
  count?: number;
  /** Fraction of each card hidden by the next one (0–0.9). */
  overlap?: number;
  /** Wave height as a fraction of the container height. */
  amplitude?: number;
  /** Wave length as a fraction of the container width. */
  wavelength?: number;
  /** Stream speed in container-widths per second; 0 = frozen. */
  speed?: number;
  /** Flip intensity — 0 rides a flat rail, 1 is the cinematic default. */
  tilt?: number;
  /** Perspective amount — crest scale + trough dimming (0–1). */
  depth?: number;
  /** Drifting confetti-square ambience layer. */
  confetti?: boolean;
  /** Number of confetti squares. */
  confettiCount?: number;
  /** Whole-layer opacity (0–1). */
  opacity?: number;
  /** Deterministic variation of the confetti field. */
  seed?: number;
}

type RGB = [number, number, number];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const TAU = Math.PI * 2;

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
const rgba = (c: RGB, a: number) =>
  `rgba(${c[0]},${c[1]},${c[2]},${clamp01(a).toFixed(3)})`;

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
const CONFETTI_GRAY: RGB = [124, 124, 130];

/** Fallback palette — the shipped pastel trio (rose / periwinkle / lilac). */
const FALLBACK_COLORS: RGB[] = [
  [244, 167, 179],
  [169, 182, 230],
  [217, 174, 224],
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
      if (d[3]! > 0) out = [d[0]!, d[1]!, d[2]!];
    }
  }
  if (out) colorCache.set(spec, out);
  return out;
}

/** One card's pose for this frame, depth-sorted so far cards paint first. */
interface Card {
  x: number;
  y: number;
  zc: number;
  theta: number;
  colorIdx: number;
}

export const CardTrain = React.forwardRef<HTMLDivElement, CardTrainProps>(
  (
    {
      className,
      colors = ["#f4a7b3", "#a9b6e6", "#d9aee0"],
      background = "transparent",
      cardSize = 150,
      count = 26,
      overlap = 0.65,
      amplitude = 0.18,
      wavelength = 1.4,
      speed = 0.12,
      tilt = 1,
      depth = 0.25,
      confetti = true,
      confettiCount = 24,
      opacity = 1,
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
      colors, background, cardSize, count, overlap, amplitude, wavelength,
      speed, tilt, depth, confetti, confettiCount, seed, reduced,
    });
    propsRef.current = {
      colors, background, cardSize, count, overlap, amplitude, wavelength,
      speed, tilt, depth, confetti, confettiCount, seed, reduced,
    };

    useEffect(() => {
      const wrap = wrapRef.current;
      const canvas = canvasRef.current;
      if (!wrap || !canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      let w = 0;
      let h = 0;
      let dpr = 1;
      let raf = 0;
      let running = true;
      let T = 0;
      let last = performance.now();
      let dirty = true;

      // card outline sampled once per resize: 8 points per rounded corner
      const PTS = 32;
      const local = new Float32Array(PTS * 2);
      const proj = new Float32Array(PTS * 2);
      const buildOutline = (size: number) => {
        const r = size * 0.22;
        const e = size / 2;
        // corner centers + arc start angle, counter-clockwise from top-right
        const corners: [number, number, number][] = [
          [e - r, -e + r, -Math.PI / 2],
          [e - r, e - r, 0],
          [-e + r, e - r, Math.PI / 2],
          [-e + r, -e + r, Math.PI],
        ];
        let k = 0;
        for (const [cx, cy, a0] of corners) {
          for (let i = 0; i <= 7; i++) {
            const a = a0 + (i / 7) * (Math.PI / 2);
            local[k * 2] = cx + r * Math.cos(a);
            local[k * 2 + 1] = cy + r * Math.sin(a);
            k++;
          }
        }
      };

      const resize = () => {
        const rect = wrap.getBoundingClientRect();
        w = Math.max(rect.width, 1);
        h = Math.max(rect.height, 1);
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        buildOutline(Math.min(propsRef.current.cardSize, w * 0.105));
        dirty = true;
        if (propsRef.current.speed <= 0 || propsRef.current.reduced) render();
      };

      const render = () => {
        const p = propsRef.current;
        dirty = false;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        if (p.background !== "transparent") {
          ctx.fillStyle = p.background;
          ctx.fillRect(0, 0, w, h);
        }
        const bgCol = p.background === "transparent"
          ? null
          : normalizeColor(p.background);

        const size = Math.min(p.cardSize, w * 0.105);
        const cy = h * 0.42;
        const amp = clamp01(p.amplitude + 0.0001) * h;
        const waveLen = Math.max(p.wavelength * w, size * 4);
        const ov = clamp01(p.overlap) * 0.9;
        const spacing = Math.max(size * (1 - ov), size * 0.12);
        const margin = size * 2;
        const span = w + margin * 2;
        const needed = Math.ceil(span / spacing) + 2;
        const n = Math.max(Math.round(p.count), needed);
        const F = size * 3.2;
        const drift = T * 2 * p.speed; // the wave itself glides slowly forward

        // ---- confetti: most behind the train, a few drifting in front ----
        const drawConfetti = (front: boolean) => {
          if (!p.confetti) return;
          for (let j = 0; j < p.confettiCount; j++) {
            const isFront = hash(j, p.seed + 4) > 0.78;
            if (isFront !== front) continue;
            const s = 4 + 9 * hash(j, p.seed);
            const bx = (hash(j, p.seed + 1) * (w + 120)) - 60;
            const by = hash(j, p.seed + 2) * h;
            const tt = T * Math.max(p.speed, 0.001);
            const x = bx + 22 * Math.sin(tt * 0.9 + hash(j, p.seed + 6) * TAU);
            const y = by + 16 * Math.sin(tt * 1.3 + hash(j, p.seed + 7) * TAU);
            const rot = tt * 0.3 * (0.4 + hash(j, p.seed + 8)) + hash(j, p.seed + 9) * TAU;
            const a = 0.14 + 0.2 * hash(j, p.seed + 5);
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(rot);
            ctx.fillStyle = rgba(CONFETTI_GRAY, a);
            ctx.fillRect(-s / 2, -s / 2, s, s);
            ctx.restore();
          }
        };

        drawConfetti(false);

        // ---- the train ----
        const colorList = Array.isArray(p.colors)
          ? p.colors
          : String(p.colors).split(",").map((c) => c.trim()).filter(Boolean);
        const palette = colorList
          .map(normalizeColor)
          .filter((c): c is RGB => c !== null);
        const cols = palette.length > 0 ? palette : FALLBACK_COLORS;
        const offset = ((T * p.speed * w) % span + span) % span;

        const cards: Card[] = [];
        for (let i = 0; i < n; i++) {
          let x = ((((i * spacing - offset) % span) + span) % span) - margin;
          const theta = (TAU * x) / waveLen;
          const y = cy + amp * Math.sin(theta - drift);
          const zc = p.depth * size * Math.sin(theta);
          cards.push({ x, y, zc, theta, colorIdx: i });
        }
        cards.sort((a, b) => a.zc - b.zc);

        const dimBase = bgCol ?? mixRgb(cols[0]!, WHITE, 0.55); // transparent pages dim toward a tint of the palette
        for (const card of cards) {
          const base = cols[card.colorIdx % cols.length] ?? cols[0]!;

          // pose, phase-locked to the wave: yaw flips twice per wavelength,
          // pitch follows the crest, the base square sits corner-up
          const yaw = p.tilt * Math.sin(2 * card.theta + 0.9);
          const pitch = 0.35 * p.tilt * Math.cos(card.theta);
          const rotZ = 0.7;
          const cosZ = Math.cos(rotZ), sinZ = Math.sin(rotZ);
          const cosX = Math.cos(pitch), sinX = Math.sin(pitch);
          const cosY = Math.cos(yaw), sinY = Math.sin(yaw);

          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (let k = 0; k < PTS; k++) {
            const lx = local[k * 2]!;
            const ly = local[k * 2 + 1]!;
            // rotZ (in plane) → rotX (pitch) → rotY (yaw), then perspective
            const x1 = lx * cosZ - ly * sinZ;
            const y1 = lx * sinZ + ly * cosZ;
            const y2 = y1 * cosX;
            const z2 = y1 * sinX;
            const x3 = x1 * cosY + z2 * sinY;
            const z3 = -x1 * sinY + z2 * cosY + card.zc;
            const s = F / (F - z3);
            const px = card.x + x3 * s;
            const py = card.y + y2 * s;
            proj[k * 2] = px;
            proj[k * 2 + 1] = py;
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
          }

          // far cards dim toward the backdrop — cheap aerial perspective
          const near = clamp01((card.zc / (p.depth * size) + 1) / 2);
          const body = mixRgb(base, dimBase, (1 - near) * 0.3 * clamp01(p.depth * 4));

          const path = new Path2D();
          path.moveTo(proj[0]!, proj[1]!);
          for (let k = 1; k < PTS; k++) path.lineTo(proj[k * 2]!, proj[k * 2 + 1]!);
          path.closePath();

          ctx.save();
          // the shadow falls on the cards stacked behind — the layered look
          ctx.shadowColor = rgba(BLACK, 0.16);
          ctx.shadowBlur = size * 0.14;
          ctx.shadowOffsetY = size * 0.07;
          const g = ctx.createLinearGradient(minX, minY, maxX, maxY);
          g.addColorStop(0, rgba(mixRgb(body, WHITE, 0.5), 1));
          g.addColorStop(0.45, rgba(body, 1));
          g.addColorStop(1, rgba(mixRgb(body, BLACK, 0.16), 1));
          ctx.fillStyle = g;
          ctx.fill(path);
          ctx.restore();

          ctx.strokeStyle = rgba(mixRgb(body, BLACK, 0.35), 0.3);
          ctx.lineWidth = 1;
          ctx.stroke(path);

          // glossy top edge — the outline points that landed above center
          ctx.strokeStyle = rgba(WHITE, 0.55);
          ctx.lineWidth = Math.max(size * 0.016, 1.2);
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.beginPath();
          let open = false;
          for (let k = 0; k < PTS; k++) {
            const py = proj[k * 2 + 1]!;
            if (py < card.y - size * 0.06) {
              if (!open) {
                ctx.moveTo(proj[k * 2]!, py);
                open = true;
              } else {
                ctx.lineTo(proj[k * 2]!, py);
              }
            } else {
              open = false;
            }
          }
          ctx.stroke();
        }

        drawConfetti(true);
      };

      const tick = (now: number) => {
        if (!running) return;
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        const p = propsRef.current;
        if (p.speed > 0) {
          T += dt;
          render();
        } else if (dirty) {
          render();
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

      resize();
      if (propsRef.current.reduced) {
        T = 2.2; // one settled static frame
        render();
      } else {
        raf = requestAnimationFrame(tick);
      }

      return () => {
        stop();
        ro.disconnect();
        mq.removeEventListener("change", onMq);
        document.removeEventListener("visibilitychange", onVis);
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
        style={{
          background: background === "transparent" ? undefined : background,
          opacity: clamp01(opacity),
          ...rest.style,
        }}
      >
        <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 block h-full w-full" />
      </div>
    );
  },
);
CardTrain.displayName = "CardTrain";

export default CardTrain;
