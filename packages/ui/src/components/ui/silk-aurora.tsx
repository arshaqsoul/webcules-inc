"use client";
import React, { useEffect, useRef, useState } from "react";
import { cn } from "@webcules/ui/lib/utils";

/**
 * SilkAurora — flowing silk ribbons of gradient light, pure canvas 2D.
 *
 * N translucent ribbon sheets (default 2) cross behind your copy like strips of
 * silk in a slow updraft. Each ribbon is a bowing spline with a tapered width
 * profile, a gradient mapped along its arc, feathered edges, and a thin brighter
 * "fold" line where the fabric catches light (`sheen` pushes it toward a glass/
 * chrome edge). The field breathes, swings, leans, and the colors slide along
 * the band — a near-seamless ~14 s cycle at `speed 1`.
 *
 * Everything renders on a low-resolution offscreen buffer that is upscaled with
 * smoothing: the silk blur comes free and per-frame cost stays in the single-digit
 * milliseconds even at `count 6`. Zero runtime dependencies, deterministic
 * (sin-hash from `seed`), decorative (`aria-hidden`), and reduced-motion safe.
 */

export interface SilkAuroraProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Gradient stops mapped along each ribbon — an array of CSS colors, or one
   *  comma-separated string (`"#ff8a3d,#e2314d"`) for configs and snippets. */
  colors?: string[] | string;
  /** Number of ribbon sheets (1–6). */
  count?: number;
  /** Canvas backdrop color; "transparent" lets the page show through. */
  background?: string;
  /** Base tilt of the ribbon field, in degrees. */
  orientation?: number;
  /** How much the ribbons bow around the center (0–1). */
  curvature?: number;
  /** Breathing / undulation strength (0–1). */
  amplitude?: number;
  /** Band thickness relative to the viewport (0–1). */
  width?: number;
  /** Ribbon length relative to the viewport diagonal (0–1.5). */
  length?: number;
  /** Global zoom of the composition. */
  scale?: number;
  /** Composition anchor, 0–1 of the canvas. */
  origin?: { x: number; y: number };
  /** Time multiplier; 0 = frozen. 1 ≈ the reference's ~14 s cycle. */
  speed?: number;
  /** How far the crossing point wanders vs pure rotation (0–1). */
  drift?: number;
  /** Ribbon opacity / color strength (0–1). */
  intensity?: number;
  /** Edge feathering (0–1): low = glassy, high = misty. */
  softness?: number;
  /** Ribbon compositing against the backdrop. */
  blend?: "normal" | "multiply" | "screen" | "overlay";
  /** Bright fold-line along each ribbon edge (0–1); → 1 for the chrome look. */
  sheen?: number;
  /** Film-grain overlay (0–1); needs a background color to sit on. */
  grain?: number;
  /** The field leans subtly toward the pointer. */
  interactive?: boolean;
  /** Deterministic variation — same seed, same silk. */
  seed?: number;
}

type RGB = [number, number, number];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
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
const rgba = (c: RGB, a: number) =>
  `rgba(${c[0]},${c[1]},${c[2]},${clamp01(a).toFixed(3)})`;

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

/** Fallback ramp — the reference sunset. */
const FALLBACK_RAMP: RGB[] = [
  [255, 138, 61],
  [226, 49, 77],
  [147, 51, 234],
  [129, 140, 248],
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

const BLEND_MODES: Record<string, GlobalCompositeOperation> = {
  normal: "source-over",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
};

export const SilkAurora = React.forwardRef<HTMLDivElement, SilkAuroraProps>(
  (
    {
      className,
      colors = ["#ff8a3d", "#e2314d", "#9333ea", "#818cf8"],
      count = 2,
      background = "#ffffff",
      orientation = -35,
      curvature = 0.55,
      amplitude = 0.5,
      width = 0.5,
      length = 1.25,
      scale = 1,
      origin = { x: 0.5, y: 0.5 },
      speed = 1,
      drift = 0.7,
      intensity = 0.85,
      softness = 0.55,
      blend = "normal",
      sheen = 0.5,
      grain = 0,
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
      colors, count, background, orientation, curvature, amplitude, width, length,
      scale, origin, speed, drift, intensity, softness, blend, sheen, grain,
      interactive, seed, reduced,
    });
    propsRef.current = {
      colors, count, background, orientation, curvature, amplitude, width, length,
      scale, origin, speed, drift, intensity, softness, blend, sheen, grain,
      interactive, seed, reduced,
    };

    useEffect(() => {
      const wrap = wrapRef.current;
      const canvas = canvasRef.current;
      if (!wrap || !canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const off = document.createElement("canvas");
      const offCtx = off.getContext("2d");
      if (!offCtx) return;

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
        // render buffer: ~480 px on the short side — high enough that the upscale
        // leaves no bilinear mosaic, low enough that fill cost stays trivial
        const k = Math.min(1, 480 / Math.min(w, h));
        off.width = Math.max(2, Math.round(w * k));
        off.height = Math.max(2, Math.round(h * k));
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

        const diag = Math.hypot(w, h);
        const leanP = p.interactive ? pointer.x * 0.16 : 0;
        const shiftP = p.interactive ? pointer.y * 0.05 * diag : 0;
        const baseAngle = p.orientation * RAD;

        const ribbons = Math.max(0, Math.min(6, Math.round(p.count)));
        const effLen = p.length * p.scale * diag;
        const maxW = p.width * p.scale * diag * 0.14;
        const mode = BLEND_MODES[p.blend] ?? "source-over";
        octx.globalCompositeOperation = mode;

        for (let i = 0; i < ribbons; i++) {
          const s = p.seed * 7 + i * 13;
          const flip = i % 2 === 1 ? -1 : 1;
          const phase = hash(i, s + 1) * Math.PI * 2;

          // slow field motion: swing, lean, breathing, color slide
          const swingX = p.drift * diag * 0.06 * Math.sin(T * 0.23 + hash(i, s + 2) * 6.28);
          const swingY = p.drift * diag * 0.075 * Math.sin(T * 0.19 + hash(i, s + 3) * 6.28);
          const lean = p.drift * 0.13 * Math.sin(T * 0.16 + hash(i, s + 4) * 6.28);
          const breathe = 1 + p.amplitude * 0.3 * Math.sin(T * 0.9 + phase);
          const slide = p.amplitude * 0.14 * Math.sin(T * 0.21 + hash(i, s + 5) * 6.28);
          const bow =
            p.curvature * (0.22 + 0.14 * hash(i, s + 6)) * diag * flip *
            (1 + p.amplitude * 0.15 * Math.sin(T * 0.7 + phase));
          // cubic control points: asymmetric curvature, ~40% of ribbons S-curve —
          // ribbons with character, not identical arcs
          const c1y = bow * (0.5 + 0.9 * hash(i, s + 10));
          const c2y = bow * (0.5 + 0.9 * hash(i, s + 14)) * (hash(i, s + 15) < 0.4 ? -1 : 1);

          const cosA = Math.cos(baseAngle + lean + leanP);
          const sinA = Math.sin(baseAngle + lean + leanP);
          const cx = p.origin.x * w + swingX;
          const cy = p.origin.y * h + swingY + shiftP;

          // ramp direction alternates, like the reference's mirrored color orders
          const fwd = flip === 1;
          const colorList = Array.isArray(p.colors)
            ? p.colors
            : String(p.colors).split(",").map((c) => c.trim()).filter(Boolean);
          const ramp = colorList.map(normalizeColor).filter((c): c is RGB => c !== null);
          const litSide = flip; // the glossy edge of this ribbon
          const darkBlend = mode === "screen"; // glow layers flood a dark backdrop
          const N = 56;
          let prevX = 0;
          let prevY = 0;

          // one elongated soft ellipse; gradient centers live in the stamp's LOCAL
          // space — a center at (px,py) would land at 2·(px,py) after the translate
          const stamp = (
            ox: number, oy: number, rot: number, r: number,
            g: CanvasGradient, elong: number, comp: GlobalCompositeOperation,
          ) => {
            octx.save();
            octx.globalCompositeOperation = comp;
            octx.translate(ox, oy);
            octx.rotate(rot);
            octx.scale(elong, 1);
            octx.fillStyle = g;
            octx.beginPath();
            octx.arc(0, 0, r, 0, Math.PI * 2);
            octx.fill();
            octx.restore();
          };

          for (let j = 0; j <= N; j++) {
            const u = j / N;
            // cubic spine in ribbon-local space: P0(-L/2,0) P1(-L/6,c1y) P2(L/6,c2y) P3(L/2,0)
            const iu = 1 - u;
            const lx =
              iu * iu * iu * (-effLen / 2) +
              3 * iu * iu * u * (-effLen / 6) +
              3 * iu * u * u * (effLen / 6) +
              u * u * u * (effLen / 2);
            const ly = 3 * iu * iu * u * c1y + 3 * iu * u * u * c2y;
            // cubic tangent → normal
            const tx = (3 * iu * iu + 6 * iu * u + 3 * u * u) * (effLen / 3);
            const ty = 3 * iu * iu * c1y + 6 * iu * u * (c2y - c1y) - 3 * u * u * c2y;
            const tl = Math.hypot(tx, ty) || 1;
            const nx = -ty / tl;
            const ny = tx / tl;
            // fatter envelope: thick through the middle, pointy tips
            const envelope = Math.pow(Math.sin(Math.PI * u), 0.5);
            // dual-harmonic flutter — the floating drift
            const flutter =
              (Math.sin(u * 3.4 + T * 0.5 + phase) * 0.62 +
                Math.sin(u * 7.1 - T * 0.33 + phase * 1.7) * 0.38) *
              p.amplitude * maxW * 0.42 * Math.pow(Math.sin(Math.PI * u), 0.8);

            const localX = lx + nx * flutter;
            const localY = ly + ny * flutter;
            const px = cx + localX * cosA - localY * sinA;
            const py = cy + localX * sinA + localY * cosA;
            const rot = Math.atan2(py - prevY, px - prevX) || 0;
            prevX = px;
            prevY = py;
            const halfW = maxW * envelope * breathe;
            if (halfW < 0.3) continue;

            const rampT = clamp01((fwd ? u : 1 - u) + slide);
            const col = sampleRamp(ramp.length > 0 ? ramp : FALLBACK_RAMP, rampT);

            // layered glass shading. The body and rim use the ribbon's blend mode;
            // the highlight layers always paint source-over — under multiply they
            // would be erased (white × anything = no-op) and under screen they
            // would flood a dark backdrop to pure white.
            // 0) halo — feathers the sheet edge into the backdrop
            const haloA = p.intensity * (darkBlend ? 0.03 : 0.055) * (0.6 + 0.4 * envelope);
            const gHalo = octx.createRadialGradient(0, 0, halfW * 0.3, 0, 0, halfW * 1.12);
            gHalo.addColorStop(0, rgba(col, haloA));
            gHalo.addColorStop(1, rgba(col, 0));
            stamp(px, py, rot, halfW * 1.12, gHalo, 1.5, mode);

            // 1) glass body — flat-top cross profile with a tight edge: a solid
            //    sheet, nudged toward the lit side so the shadow half stays deeper
            const bodyA = p.intensity * (0.28 + 0.1 * hash(i, s + 9)) * (0.7 + 0.3 * envelope);
            const gBody = octx.createRadialGradient(0, 0, halfW * 0.04, 0, 0, halfW);
            gBody.addColorStop(0, rgba(col, bodyA));
            gBody.addColorStop(0.62, rgba(col, bodyA * 0.95));
            gBody.addColorStop(0.92, rgba(col, bodyA * 0.55));
            gBody.addColorStop(1, rgba(col, 0));
            stamp(px + nx * litSide * halfW * 0.1, py + ny * litSide * halfW * 0.1, rot, halfW, gBody, 1.6, mode);

            // 2) broad reflection — the lit half lifts toward white
            const lift = mixRgb(col, WHITE, darkBlend ? 0.3 : 0.4);
            const glowA = p.sheen * (darkBlend ? 0.1 : 0.18) * envelope;
            const gGlow = octx.createRadialGradient(0, 0, 0, 0, 0, halfW * 0.45);
            gGlow.addColorStop(0, rgba(lift, glowA));
            gGlow.addColorStop(1, rgba(lift, 0));
            stamp(px + nx * litSide * halfW * 0.15, py + ny * litSide * halfW * 0.15, rot, halfW * 0.45, gGlow, 1.9, "source-over");

            // 3) specular streak — hugs the lit edge and SHIMMERS along the band.
            //    A constant full-alpha line saturates through the stamp overlap and
            //    reads as a painted white stripe; the shimmer keeps it light-like.
            const specR = Math.max(halfW * 0.14, 0.6);
            const shimmer = 0.55 + 0.45 * Math.sin(u * 9.2 - T * 0.45 + phase * 2.3);
            const specA = Math.pow(p.sheen, 1.2) * 0.55 * shimmer * envelope;
            const gSpec = octx.createRadialGradient(0, 0, 0, 0, 0, specR);
            gSpec.addColorStop(0, rgba(mixRgb(col, WHITE, 0.9), specA));
            gSpec.addColorStop(0.5, rgba(mixRgb(col, WHITE, 0.7), specA * 0.45));
            gSpec.addColorStop(1, rgba(mixRgb(col, WHITE, 0.7), 0));
            stamp(px + nx * litSide * halfW * 0.45, py + ny * litSide * halfW * 0.45, rot, specR, gSpec, 2.4, "source-over");

            // 4) dark glass rim — the shadowed far edge that gives it dimension
            const edgeR = Math.max(halfW * 0.16, 0.6);
            const edgeA = (0.1 + 0.22 * p.sheen) * envelope;
            const gEdge = octx.createRadialGradient(0, 0, 0, 0, 0, edgeR);
            gEdge.addColorStop(0, rgba(mixRgb(col, BLACK, 0.45), edgeA));
            gEdge.addColorStop(1, rgba(mixRgb(col, BLACK, 0.45), 0));
            stamp(px - nx * litSide * halfW * 0.74, py - ny * litSide * halfW * 0.74, rot, edgeR, gEdge, 1.9, mode);
          }
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

        // upscale — smoothing plus a soft blur pass: silk without bilinear mosaic
        const dprScale = canvas.width / Math.max(w, 1);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.filter = `blur(${((0.4 + clamp01(p.softness) * 1.2) * dprScale).toFixed(2)}px)`;
        ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
        ctx.filter = "none";
      };

      const tick = (now: number) => {
        if (!running) return;
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        T += dt * Math.max(propsRef.current.speed, 0) * 0.55;
        // ease the pointer lean toward its target
        pointer.x += (pointer.tx - pointer.x) * 0.06;
        pointer.y += (pointer.ty - pointer.y) * 0.06;
        render();
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
SilkAurora.displayName = "SilkAurora";

export default SilkAurora;
