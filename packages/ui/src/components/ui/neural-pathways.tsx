"use client";
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@webcules/ui/lib/utils";

/**
 * NeuralPathways — dual-waist light-stream lens, pure SVG.
 *
 * Four filament "wings" (two colored `primary` from the top corners, two `secondary` from
 * the bottom) pour inward, wave, and pinch at two separate waists (focalY ∓ lensGap/2),
 * forming the lens/vesica of the reference. Everything is parametric geometry: strands are
 * real <path> elements, motion is pure CSS (offset-path particles, drift, pulse, twinkle) —
 * no canvas loop, no generated imagery. Optional `cloudImage` (a local texture URL) is
 * screened into the cloud banks for photoreal depth; without it the banks are turbulence
 * clouds. Decorative: aria-hidden, no content inside, static frame under reduced motion.
 */

export interface NeuralPathwaysProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Top wing stream color. */
  primary?: string;
  /** Bottom wing stream color. */
  secondary?: string;
  /** Filament strands per wing. */
  streamCount?: number;
  /** Global stroke-width multiplier. */
  thickness?: number;
  /** Thick, brighter strands per wing. */
  heroStrands?: number;
  /** Wave amplitude along strands (0 = straight). */
  waveAmp?: number;
  /** Wave frequency along strands. */
  waveFreq?: number;
  /** Fan width of the bundle at the corners (fraction of the diagonal). */
  spread?: number;
  /** Lens center, 0–1 of the canvas. */
  focalX?: number;
  focalY?: number;
  /** Vertical distance between the two waists (fraction of height). */
  lensGap?: number;
  /** 0–1: how much the opposite wing color bleeds into strands near the waist. */
  crossTint?: number;
  /** Warp throttle: inward light-rush dashes + gate rings (0 = off, 1 = default, 2.5 = extreme). */
  zoom?: number;
  /** Bloom strength multiplier. */
  glow?: number;
  /** Global motion speed multiplier. */
  speed?: number;
  /** 0–2 multipliers. */
  particleDensity?: number;
  starDensity?: number;
  cloudDensity?: number;
  cloudSpeed?: number;
  showClouds?: boolean;
  showStars?: boolean;
  /** Optional local texture URL screened into the cloud banks (e.g. a ComfyUI still). */
  cloudImage?: string;
  /** Deterministic seed for jitter/cloud/star placement. */
  seed?: number;
  /** Sky gradient (top, mid at 62%, bottom). */
  bgTop?: string;
  bgMid?: string;
  bgBottom?: string;
  /** Bright pulses racing along the strands (true) or plain solid lines (false). */
  pulseLines?: boolean;
  /** Where the fog banks sit. */
  cloudPosition?: "corners" | "bottom" | "top" | "veil";
  /** Base tint of the fog/clouds (lit by the wing colors). */
  cloudTint?: string;
  /** Dot size multipliers. */
  particleSize?: number;
  starSize?: number;
}

type Pt = { x: number; y: number };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function hash(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(v.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const rgba = (hex: string, a: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${clamp01(a).toFixed(3)})`;
};

const mix = (a: string, b: string, t: number) => {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const k = clamp01(t);
  const f = (x: number, y: number) => Math.round(x + (y - x) * k);
  return `#${[f(r1, r2), f(g1, g2), f(b1, b2)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

/** Smooth path through points (quadratic midpoints). */
function smoothPath(pts: Pt[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0]!.x.toFixed(1)} ${pts[0]!.y.toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i]!.x + pts[i + 1]!.x) / 2;
    const my = (pts[i]!.y + pts[i + 1]!.y) / 2;
    d += ` Q ${pts[i]!.x.toFixed(1)} ${pts[i]!.y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  const last = pts[pts.length - 1]!;
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return d;
}

type Strand = { d: string; frames: string[]; whipDur: number; width: number; opacity: number; hero: boolean };

const FOG_FRAG = `
precision mediump float;
uniform vec2 u_res; uniform float u_time; uniform float u_density; uniform float u_seed;
uniform vec3 u_primary; uniform vec3 u_secondary; uniform vec2 u_waistP; uniform vec2 u_waistS; uniform float u_glow;
uniform float u_mode; uniform vec3 u_tint;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + u_seed*13.7) * 43758.5453); }
float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),u.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),u.x), u.y); }
float fbm(vec2 p){ float v=0.0; float a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p=p*2.07+vec2(1.7,9.2); a*=0.55; } return v; }
void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  float xr = 1.78 / aspect; // keep bank widths frame-relative on tall canvases
  vec2 p = vec2(gl_FragCoord.x / u_res.y, gl_FragCoord.y / u_res.y);
  float t = u_time;
  vec2 cl = vec2(0.14*aspect, 0.04);
  vec2 cr = vec2(0.90*aspect, -0.02);
  float ml = exp(-pow(length((p-cl)*vec2(xr,1.55)),1.7)*2.6);
  float mr = exp(-pow(length((p-cr)*vec2(xr,1.5)),1.7)*2.1);
  float bank;
  if (u_mode < 0.5)      bank = max(ml, mr*1.12);
  else if (u_mode < 1.5) bank = exp(-pow((1.0-uv.y)*2.1, 1.5)*2.4);
  else if (u_mode < 2.5) bank = exp(-pow(uv.y*2.1, 1.5)*2.4);
  else                   bank = 0.72;
  vec2 q = vec2(fbm(p*1.9 + vec2(t*0.045, 0.0)), fbm(p*1.9 + vec2(4.7, t*0.032)));
  float f = fbm(p*2.4 + 2.1*q + vec2(-t*0.02, t*0.01));
  float d = clamp((f - 0.32) * bank * (0.9 + u_density*1.6), 0.0, 1.0);
  d = d*d*(3.0-2.0*d);
  float upw = clamp(fbm(p*3.1 + vec2(t*0.016, -t*0.008) + 7.3) - 0.52, 0.0, 1.0);
  upw *= exp(-pow((uv.y - 0.72)*3.4, 2.0)) * (0.05 + 0.2*u_density);
  d = clamp(d + upw, 0.0, 1.0);
  if (d < 0.012) { gl_FragColor = vec4(0.0); return; }
  vec2 diffP = gl_FragCoord.xy - u_waistP;
  vec2 diffS = gl_FragCoord.xy - u_waistS;
  float dP = length(diffP) / u_res.y;
  float dS = length(diffS) / u_res.y;
  vec3 light = u_primary*(0.045/(0.015+dP*dP)) + u_secondary*(0.045/(0.015+dS*dS));
  light *= (0.45 + 0.55*u_glow);
  vec3 col = u_tint*(0.22 + d*0.45) + light*(0.45 + d);
  col = mix(col, vec3(0.95,0.97,1.0), d*0.3);
  gl_FragColor = vec4(col, clamp(d*1.35, 0.0, 0.85));
}`;

/** Procedural WebGL fog layer — scene-lit FBM banks drifting under the SVG strands. */
function FogCanvas({
  w, h, primary, secondary, waistP, waistS, density, speed, cloudSpeed, glow, seed, reduced, onUnavailable,
  mode, tint,
}: {
  w: number; h: number; primary: string; secondary: string; waistP: Pt; waistS: Pt;
  density: number; speed: number; cloudSpeed: number; glow: number; seed: number; reduced: boolean;
  onUnavailable: () => void;
  mode: number; tint: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || w < 4 || h < 4) return;
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: false });
    if (!gl) {
      onUnavailable();
      return;
    }
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader compile failed");
      return s;
    };
    let prog: WebGLProgram;
    try {
      prog = gl.createProgram()!;
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, "attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }"));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FOG_FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link failed");
    } catch {
      onUnavailable();
      return;
    }
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (n: string) => gl.getUniformLocation(prog, n);
    const u = {
      res: U("u_res"), time: U("u_time"), den: U("u_density"), seed: U("u_seed"),
      p: U("u_primary"), s: U("u_secondary"), wp: U("u_waistP"), ws: U("u_waistS"), glow: U("u_glow"),
      mode: U("u_mode"), tint: U("u_tint"),
    };
    const rgb = (hex: string) => hexToRgb(hex).map((v) => v / 255);
    const cP = rgb(primary), cS = rgb(secondary), cT = rgb(tint);
    const modeNum = { corners: 0, bottom: 1, top: 2, veil: 3 }[mode] ?? 0;
    const resize = () => {
      canvas.width = Math.max(2, Math.round(w * 0.5));
      canvas.height = Math.max(2, Math.round(h * 0.5));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    let raf = 0, running = true, t = 18 + (seed % 10), last = performance.now();
    const draw = () => {
      gl.uniform2f(u.res, canvas.width, canvas.height);
      gl.uniform1f(u.time, t);
      gl.uniform1f(u.den, density);
      gl.uniform1f(u.seed, seed);
      gl.uniform3f(u.p, cP[0]!, cP[1]!, cP[2]!);
      gl.uniform3f(u.s, cS[0]!, cS[1]!, cS[2]!);
      gl.uniform2f(u.wp, waistP.x * 0.5, (h - waistP.y) * 0.5);
      gl.uniform2f(u.ws, waistS.x * 0.5, (h - waistS.y) * 0.5);
      gl.uniform1f(u.glow, glow);
      gl.uniform1f(u.mode, modeNum);
      gl.uniform3f(u.tint, cT[0]!, cT[1]!, cT[2]!);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const tick = (now: number) => {
      if (!running) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      t += dt * speed * (0.6 + 0.4 * cloudSpeed);
      draw();
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (running || reduced) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVis);
    if (reduced) {
      t = 26;
      draw();
    } else {
      raf = requestAnimationFrame(tick);
    }
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [w, h, primary, secondary, waistP.x, waistP.y, waistS.x, waistS.y, density, speed, cloudSpeed, glow, seed, reduced, onUnavailable, mode, tint]);
  if (w < 4 || h < 4) return null;
  return <canvas ref={ref} className="absolute inset-0 block h-full w-full" />;
}

/** One filament: origin → waist spine; the wave is a traveling phase (whip lash) + a static hook. */
function strand(w: number, h: number, wing: number, i: number, count: number, p: Required<Pick<NeuralPathwaysProps, "focalX" | "focalY" | "lensGap" | "spread" | "waveAmp" | "waveFreq" | "thickness" | "heroStrands" | "streamCount">>, waist: Pt, travel = 0): Strand {
  const top = wing < 2;
  const o: Pt = top
    ? { x: (wing === 0 ? -0.06 : 1.06) * w, y: -0.16 * h }
    : { x: (wing === 2 ? -0.06 : 1.06) * w, y: 1.16 * h };
  const k = (count > 1 ? i / (count - 1) : 0.5) - 0.5;
  const ax = waist.x - o.x, ay = waist.y - o.y;
  const len = Math.hypot(ax, ay) || 1;
  const px = -ay / len, py = ax / len; // perpendicular
  const s1 = p.spread * Math.hypot(w, h);
  const c1: Pt = { x: o.x + ax * 0.26 + px * k * s1 * 1.5, y: o.y + ay * 0.26 + py * k * s1 * 1.5 };
  const c2: Pt = { x: o.x + ax * 0.7 + px * k * s1 * 0.2, y: o.y + ay * 0.7 + py * k * s1 * 0.2 };
  const phase = hash(i, wing + p.seed) * Math.PI * 2;
  const pts: Pt[] = [];
  const N = 16;
  for (let t = 0; t <= N; t++) {
    const u = t / N;
    const base = cubic(o, c1, c2, waist, u);
    // traveling wave (the whip: crests move origin → waist as travel advances) + static corner hook
    const wave = Math.sin(u * p.waveFreq * Math.PI * 2 + phase - travel * Math.PI * 2) * p.waveAmp * s1 * 0.35 * (1 - u * 0.72);
    const curl = Math.sin(u * 1.7 * Math.PI + phase * 0.65) * p.waveAmp * s1 * 0.55 * (1 - u) * (1 - u);
    const off = wave + curl;
    pts.push({ x: base.x + px * off, y: base.y + py * off });
  }
  const hero = hash(i, wing + p.seed + 9) < p.heroStrands / Math.max(p.streamCount, 1);
  const width = p.thickness * (0.55 + Math.abs(k) * 1.15 + hash(i, wing + p.seed + 5) * 0.5) * (hero ? 2.3 : 1);
  const opacity = hero ? 0.95 : 0.3 + 0.55 * hash(i, wing + p.seed + 3);
  return { d: smoothPath(pts), width, opacity, hero };
}

export const NeuralPathways = React.forwardRef<HTMLDivElement, NeuralPathwaysProps>(
  (
    {
      className,
      primary = "#f5b04c",
      secondary = "#3fb6ff",
      streamCount = 18,
      thickness = 1,
      heroStrands = 3,
      waveAmp = 0.5,
      waveFreq = 2.2,
      spread = 0.135,
      focalX = 0.5,
      focalY = 0.535,
      lensGap = 0.075,
      crossTint = 0.35,
      zoom = 1,
      glow = 1,
      speed = 1,
      particleDensity = 1,
      starDensity = 1,
      cloudDensity = 0.8,
      cloudSpeed = 1,
      showClouds = true,
      showStars = true,
      cloudImage,
      seed = 7,
      bgTop = "#04060d",
      bgMid = "#081020",
      bgBottom = "#0c1526",
      pulseLines = true,
      cloudPosition = "corners",
      cloudTint = "#a8c0dd",
      particleSize = 1,
      starSize = 1,
      ...rest
    },
    ref,
  ) => {
    const svgRef = useRef<HTMLDivElement | null>(null);
    const svgElRef = useRef<SVGSVGElement | null>(null);
    const [size, setSize] = useState({ w: 0, h: 0 });
    const [reduced, setReduced] = useState(false);
    const [fogOk, setFogOk] = useState<boolean | null>(null);
    const onFogUnavailable = React.useCallback(() => setFogOk(false), []);
    const uid = useId().replace(/[^a-zA-Z0-9]/g, "");

    useEffect(() => {
      const el = svgRef.current;
      if (!el) return;
      const ro = new ResizeObserver(() => {
        const r = el.getBoundingClientRect();
        setSize({ w: Math.max(r.width, 1), h: Math.max(r.height, 1) });
      });
      ro.observe(el);
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      const onMq = () => setReduced(mq.matches);
      onMq();
      mq.addEventListener("change", onMq);
      return () => {
        ro.disconnect();
        mq.removeEventListener("change", onMq);
      };
    }, []);

    const { w, h } = size;
    const geo = useMemo(() => {
      if (w < 2 || h < 2) return null;
      const waistP: Pt = { x: focalX * w, y: (focalY - lensGap / 2) * h };
      const waistS: Pt = { x: focalX * w, y: (focalY + lensGap / 2) * h };
      const params = { focalX, focalY, lensGap, spread, waveAmp, waveFreq, thickness, heroStrands, streamCount, seed };
      const wings = [0, 1, 2, 3].map((wing) => {
        const waist = wing < 2 ? waistP : waistS;
        const origin: Pt = wing < 2
          ? { x: (wing === 0 ? -0.06 : 1.06) * w, y: -0.16 * h }
          : { x: (wing === 2 ? -0.06 : 1.06) * w, y: 1.16 * h };
        const strands = Array.from({ length: streamCount }, (_, i) => {
          const s = strand(w, h, wing, i, streamCount, params, waist);
          // whip keyframes: one full traveling-wave cycle, seamless (frame 8 == frame 0)
          const frames = Array.from({ length: 8 }, (_, j) => strand(w, h, wing, i, streamCount, params, waist, j / 8).d);
          const whipDur = (4.5 + hash(i, wing + seed + 21) * 3) / Math.max(speed, 0.05);
          return { ...s, frames, whipDur };
        });
        return { wing, color: wing < 2 ? primary : secondary, other: wing < 2 ? secondary : primary, origin, waist, strands };
      });
      const stars = Array.from({ length: Math.round(80 * starDensity) }, (_, i) => ({
        x: hash(i, seed + 101) * w,
        y: hash(i, seed + 202) * h * 0.85,
        r: 0.4 + hash(i, seed + 303) * 0.9,
        dur: (2.5 + hash(i, seed + 404) * 4) / speed,
        delay: hash(i, seed + 505) * 6,
      }));
      const particles: Array<{ wing: number; strand: number; d: string; r: number; dur: number; delay: number; bright: boolean }> = [];
      const perWing = Math.min(Math.round(streamCount * 4.5 * particleDensity), 90);
      wings.forEach((wg) => {
        for (let i = 0; i < perWing; i++) {
          const s = Math.floor(hash(i, wg.wing + seed + 7) * streamCount);
          particles.push({
            wing: wg.wing,
            strand: s,
            d: wg.strands[s]?.d ?? "",
            r: 0.7 + hash(i, wg.wing + seed + 11) * 1.5,
            dur: (7 + hash(i, wg.wing + seed + 13) * 9) / speed,
            delay: hash(i, wg.wing + seed + 17) * 16,
            bright: hash(i, wg.wing + seed + 19) < 0.2,
          });
        }
      });
      const r = Math.min(w, h);
      return {
        w, h, wings, stars, particles,
        waistP, waistS,
        bloomR: r * 0.11,
        cloud: {
          left: { cx: 0.16 * w, cy: 1.06 * h, rx: 0.5 * w, ry: 0.34 * h },
          right: { cx: 0.88 * w, cy: 1.1 * h, rx: 0.52 * w, ry: 0.38 * h },
        },
      };
    }, [w, h, primary, secondary, streamCount, thickness, heroStrands, waveAmp, waveFreq, spread, focalX, focalY, lensGap, crossTint, speed, particleDensity, starDensity, seed]);

    const dur = (base: number) => `${(base / Math.max(speed, 0.05)).toFixed(2)}s`;
    const whip = (s: { frames: string[]; whipDur: number }) =>
      !reduced && waveAmp > 0 ? (
        <animate attributeName="d" dur={`${s.whipDur.toFixed(2)}s`} repeatCount="indefinite" values={s.frames.join(";")} />
      ) : null;

    // Chromium quirk: SMIL <animate> elements inserted after page load sit frozen on the
    // document timeline — nudge the clock whenever the whip keyframes (re)mount.
    useEffect(() => {
      const svg = svgElRef.current;
      if (!svg || reduced) return;
      svg.setCurrentTime?.(0);
      svg.unpauseAnimations?.();
    }, [geo, reduced]);

    return (
      <div
        {...rest}
        ref={(node) => {
          svgRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        aria-hidden="true"
        className={cn("relative overflow-hidden", className)}
        style={{ background: `linear-gradient(180deg, ${bgTop} 0%, ${bgMid} 62%, ${bgBottom} 100%)`, ...rest.style }}
      >
        {geo && showClouds && fogOk !== false ? (
          <FogCanvas
            w={w}
            h={h}
            primary={primary}
            secondary={secondary}
            waistP={geo.waistP}
            waistS={geo.waistS}
            density={cloudDensity}
            speed={speed}
            cloudSpeed={cloudSpeed}
            glow={glow}
            seed={seed}
            reduced={reduced}
            onUnavailable={onFogUnavailable}
            mode={cloudPosition === "bottom" ? "bottom" : cloudPosition === "top" ? "top" : cloudPosition === "veil" ? "veil" : "corners"}
            tint={cloudTint}
          />
        ) : null}
        <svg
          ref={svgElRef}
          width={w || undefined}
          height={h || undefined}
          aria-hidden="true"
          className="absolute inset-0 block h-full w-full"
        >
        <defs>
          <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#04060d" />
            <stop offset="0.62" stopColor="#081020" />
            <stop offset="1" stopColor="#0c1526" />
          </linearGradient>
          {geo
            ? geo.wings.map((wg) => (
                <linearGradient key={wg.wing} id={`${uid}-g${wg.wing}`} gradientUnits="userSpaceOnUse" x1={wg.origin.x} y1={wg.origin.y} x2={wg.waist.x} y2={wg.waist.y}>
                  <stop offset="0" stopColor={wg.color} stopOpacity={0.05} />
                  <stop offset="0.45" stopColor={wg.color} stopOpacity={0.5} />
                  <stop offset="0.8" stopColor={mix(wg.color, wg.other, crossTint)} stopOpacity={0.82} />
                  <stop offset="1" stopColor={mix(wg.color, wg.other, clamp01(crossTint * 1.5))} stopOpacity={0.95} />
                </linearGradient>
              ))
            : null}
          <radialGradient id={`${uid}-bloomP`}>
            <stop offset="0" stopColor="#ffffff" stopOpacity={0.9} />
            <stop offset="0.25" stopColor={primary} stopOpacity={0.4} />
            <stop offset="0.6" stopColor={primary} stopOpacity={0.14} />
            <stop offset="1" stopColor={primary} stopOpacity={0} />
          </radialGradient>
          <radialGradient id={`${uid}-bloomS`}>
            <stop offset="0" stopColor="#ffffff" stopOpacity={0.9} />
            <stop offset="0.25" stopColor={secondary} stopOpacity={0.42} />
            <stop offset="0.6" stopColor={secondary} stopOpacity={0.15} />
            <stop offset="1" stopColor={secondary} stopOpacity={0} />
          </radialGradient>
          <filter id={`${uid}-blur`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={(geo ? Math.min(geo.w, geo.h) * 0.005 : 4) * Math.max(glow, 0.1)} />
          </filter>
          {geo
            ? [geo.cloud.left, geo.cloud.right].map((c, i) => (
                <mask key={i} id={`${uid}-cm${i}`}>
                  <ellipse cx={c.cx} cy={c.cy} rx={c.rx} ry={c.ry} fill={`url(#${uid}-cmgrad)`} />
                </mask>
              ))
            : null}
          <radialGradient id={`${uid}-cmgrad`}>
            <stop offset="0" stopColor="#fff" />
            <stop offset="0.45" stopColor="#fff" stopOpacity={0.92} />
            <stop offset="0.75" stopColor="#fff" stopOpacity={0.4} />
            <stop offset="1" stopColor="#fff" stopOpacity={0} />
          </radialGradient>
          <filter id={`${uid}-wisps`} x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.004 0.009" numOctaves={4} seed={seed} result="n" />
            <feColorMatrix
              in="n"
              type="matrix"
              values={`0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  ${0.9 * cloudDensity} ${0.9 * cloudDensity} ${0.9 * cloudDensity} 0 -${(1.05 - 0.35 * cloudDensity).toFixed(2)}`}
            />
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <mask id={`${uid}-cm2`}>
            <rect x="0" y="0" width="100%" height="100%" fill="black" />
            <ellipse cx="10%" cy="16%" rx="30%" ry="16%" fill={`url(#${uid}-cmgrad)`} />
            <ellipse cx="92%" cy="20%" rx="32%" ry="18%" fill={`url(#${uid}-cmgrad)`} />
          </mask>
        </defs>

        <style>{`
          @keyframes sf-np-ride { to { offset-distance: 100%; } }
          @keyframes sf-np-dash { from { stroke-dashoffset: 100; } to { stroke-dashoffset: 0; } }
          @keyframes sf-np-drift { 0%,100% { transform: translateX(-2.2%); } 50% { transform: translateX(2.2%); } }
          @keyframes sf-np-pulse { 0%,100% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.14); opacity: 1; } }
          @keyframes sf-np-tw { 0%,100% { opacity: 0.12; } 50% { opacity: 0.65; } }
        `}</style>

        <rect x="0" y="0" width={w || "100%"} height={h || "100%"} fill="transparent" />

        {geo && showStars
          ? geo.stars.map((s, i) => (
              <circle
                key={i}
                cx={s.x}
                cy={s.y}
                r={s.r * starSize}
                fill="#ffffff"
                style={reduced
                  ? { opacity: 0.25 }
                  : { animation: `sf-np-tw ${dur(s.dur)} ease-in-out ${(-s.delay).toFixed(2)}s infinite` }}
              />
            ))
          : null}

        {geo && showClouds && fogOk === false ? (
          <>
            {/* fallback banks (no WebGL): local texture, screened — dark sky in the texture disappears */}
            {[0, 1].map((i) => {
              const c = i === 0 ? geo.cloud.left : geo.cloud.right;
              return (
                <g key={i} mask={`url(#${uid}-cm${i})`}>
                  <g
                    style={reduced
                      ? undefined
                      : { animation: `sf-np-drift ${dur(110 - i * 26)} ease-in-out infinite`, animationDelay: `${-i * 30}s` }}
                  >
                    {cloudImage ? (
                      <image
                        href={cloudImage}
                        x={c.cx - c.rx * 1.15}
                        y={c.cy - c.ry * 1.2}
                        width={c.rx * 2.3}
                        height={c.ry * 2.4}
                        preserveAspectRatio="xMidYMax slice"
                        style={{ mixBlendMode: "screen", opacity: clamp01(0.35 + 0.65 * cloudDensity) }}
                      />
                    ) : (
                      <rect
                        x={c.cx - c.rx}
                        y={c.cy - c.ry}
                        width={c.rx * 2}
                        height={c.ry * 2}
                        filter={`url(#${uid}-wisps)`}
                        fill={mix(cloudTint, i === 0 ? "#ffffff" : secondary, 0.4)}
                        opacity={clamp01(0.5 * cloudDensity)}
                      />
                    )}
                    <rect
                      x={c.cx - c.rx}
                      y={c.cy - c.ry}
                      width={c.rx * 2}
                      height={c.ry * 2}
                      fill={i === 0 ? mix(secondary, "#ffffff", 0.5) : secondary}
                      style={{ mixBlendMode: "color" }}
                      opacity={0.16 * cloudDensity}
                    />
                  </g>
                </g>
              );
            })}
            {/* faint golden wisps near the top wings */}
            <rect
              x={0}
              y={0}
              width="100%"
              height="42%"
              filter={`url(#${uid}-wisps)`}
              fill={primary}
              opacity={clamp01(0.05 * cloudDensity)}
              mask={`url(#${uid}-cm2)`}
            />
          </>
        ) : null}
        {/* warp streams: light-rush dashes + gate rings + blooms + particles, all flowing INTO the lens */}
        {geo ? (
          <>
            {[true, false].map((blurred) => (
              <g
                key={String(blurred)}
                filter={blurred ? `url(#${uid}-blur)` : undefined}
                opacity={blurred ? clamp01(0.75 * glow) : 1}
              >
                {geo.wings.flatMap((wg) =>
                  wg.strands.map((s, i) => (
                    <path
                      key={`${wg.wing}-${i}`}
                      d={s.d}
                      fill="none"
                      stroke={`url(#${uid}-g${wg.wing})`}
                      strokeWidth={s.width}
                      strokeOpacity={s.opacity}
                      strokeLinecap="round"
                    >
                      {blurred ? null : whip(s)}
                    </path>
                  )),
                )}
                {/* white-hot cores on hero strands (crisp layer only) */}
                {!blurred
                  ? geo.wings.flatMap((wg) =>
                      wg.strands.filter((s) => s.hero).map((s, i) => (
                        <path key={`h${wg.wing}-${i}`} d={s.d} fill="none" stroke="#ffffff" strokeWidth={s.width * 0.32} strokeOpacity={0.75} strokeLinecap="round">
                          {whip(s)}
                        </path>
                      )),
                    )
                  : null}
              </g>
            ))}

            {/* light racing along the strands: a long bright pulse per filament, base line stays continuous */}
            {pulseLines && zoom > 0 && !reduced
              ? geo.wings.flatMap((wg) =>
                  wg.strands.map((s, i) => {
                    const durN = 1.15 / Math.max(zoom, 0.15);
                    return (
                      <path
                        key={`p${wg.wing}-${i}`}
                        d={s.d}
                        pathLength={100}
                        fill="none"
                        stroke={s.hero ? "#ffffff" : mix(wg.color, "#ffffff", 0.55)}
                        strokeWidth={s.width * 0.9}
                        strokeLinecap="round"
                        strokeDasharray="26 74"
                        opacity={clamp01(0.3 + 0.3 * Math.min(zoom, 1.5))}
                        style={{
                          animation: `sf-np-dash ${durN.toFixed(2)}s linear ${(-(hash(i, wg.wing + 31) * durN)).toFixed(2)}s infinite`,
                        }}
                      >
                        {whip(s)}
                      </path>
                    );
                  }),
                )
              : null}

            {/* waist blooms */}
            {([
              [geo.waistP, `${uid}-bloomP`, 4.5] as const,
              [geo.waistS, `${uid}-bloomS`, 5.6] as const,
            ]).map(([waist, fill, base]) => (
              <ellipse
                key={fill}
                cx={waist.x}
                cy={waist.y}
                rx={geo.bloomR * 1.35}
                ry={geo.bloomR}
                fill={`url(#${fill})`}
                style={{
                  transformBox: "fill-box",
                  transformOrigin: "center",
                  ...(reduced ? { opacity: 0.9 } : { animation: `sf-np-pulse ${dur(base)} ease-in-out infinite` }),
                }}
              />
            ))}

            {/* particles riding the strands — easing accelerates them into the waist */}
            {geo.particles.map((p, i) => (
              <circle
                key={i}
                r={p.r * particleSize}
                cx={0}
                cy={0}
                fill={p.bright ? "#ffffff" : geo.wings[p.wing]!.color}
                opacity={p.bright ? 0.95 : 0.7}
                style={{
                  offsetPath: `path("${p.d}")`,
                  offsetRotate: "0deg",
                  ...(reduced
                    ? { offsetDistance: "50%" }
                    : {
                        animation: `sf-np-ride ${dur(p.dur)} cubic-bezier(0.6, 0, 0.9, 0.45) ${(-p.delay).toFixed(2)}s infinite`,
                      }),
                }}
              />
            ))}
          </>
        ) : null}
        </svg>
      </div>
    );
  },
);
NeuralPathways.displayName = "NeuralPathways";

export default NeuralPathways;
