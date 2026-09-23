"use client";
import React, { useEffect, useRef, useState } from "react";
import { cn } from "@webcules/ui/lib/utils";

/**
 * CineScroll — scroll-scrubbed cinematic hero. Scroll is the camera: a tall
 * section pins its stage (sticky) while scroll progress scrubs an ordered
 * frame sequence ("plates"). Adjacent plates blend with a lighten
 * double-exposure (or a plain crossfade), scroll velocity adds a directional
 * whip blur, each plate gets a slow Ken Burns push-in so stills breathe, and
 * a filmic grade (vignette + grain) unifies mixed-source imagery into one
 * look. Chapters are real DOM overlaid on the stage and fade/rise inside
 * their progress windows.
 *
 * Bring your own media: `frames` is any list of image URLs (photos, renders,
 * locally generated ComfyUI plates) and `chapters` is your copy. Works as a
 * page-level hero (default, over window scroll) or embedded in any scroll
 * container — pass `stageHeight` to match the container's viewport.
 *
 * Canvas 2D, zero runtime deps. One RAF, cancelled on unmount, parked when
 * the section is off-screen or the tab is hidden. DPR capped at 2; geometry
 * (vignette gradient, grain pattern, plate bitmaps) rebuilt only on resize or
 * frame change. Under `prefers-reduced-motion` the scrub becomes direct
 * manipulation: scroll still swaps plates (instantly, no smoothing, no blur,
 * no drift) — nothing moves on its own. Randomness is a sin-hash, so stills
 * and recordings are reproducible. The canvas is `aria-hidden`; chapters are
 * real, selectable DOM.
 */

export interface CineScrollChapter {
  /** progress (0–1) where the chapter starts fading in */
  from: number;
  /** progress (0–1) where the chapter is fully gone */
  to: number;
  /** horizontal placement of the chapter block */
  align?: "left" | "center" | "right";
  /** vertical placement of the chapter block */
  at?: "top" | "center" | "bottom";
  className?: string;
  /** the copy itself — headings, paragraphs, CineIndexRows, CineStat… */
  content: React.ReactNode;
}

export interface CineScrollProps extends React.HTMLAttributes<HTMLDivElement> {
  /** ordered plate URLs — preloaded, then scrubbed by scroll */
  frames?: string[];
  /** video URL — when set the scrub seeks this clip instead of the frames array */
  video?: string;
  /** copy blocks revealed inside progress windows */
  chapters?: CineScrollChapter[];
  /** total scroll track length (scroll distance = height − stage height) */
  height?: number | string;
  /** sticky stage height; match an embedding scroll container if not the window */
  stageHeight?: number | string;
  /** `exposure` = lighten double-exposure between plates, `crossfade` = plain alpha */
  blend?: "exposure" | "crossfade";
  /** 0–1 multiplier on the velocity whip blur */
  motionBlur?: number;
  /** Ken Burns push-in/pan strength per plate (0 = off) */
  drift?: number;
  /** scrub damping (0 = raw, 0.14 = filmic lag) */
  scrollSmoothing?: number;
  /** filmic unifier over the plates */
  grade?: { vignette?: number; grain?: number };
}

/** Row of an on-film index — year, underlined title, note (all optional but title). */
export interface CineIndexRow {
  year?: string;
  title: string;
  note?: string;
  href?: string;
}

export function CineIndexRows({ rows, className }: { rows: CineIndexRow[]; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-10 gap-y-4", className)}>
      {rows.map((r, i) => (
        <div key={i} className="flex items-baseline gap-3 text-white">
          {r.year ? <span className="text-xs text-white/60">{r.year}</span> : null}
          {r.href ? (
            <a
              href={r.href}
              className="text-xl font-medium underline decoration-white/40 underline-offset-4 transition-colors hover:decoration-white md:text-2xl"
            >
              {r.title}
            </a>
          ) : (
            <span className="text-xl font-medium underline decoration-white/40 underline-offset-4 md:text-2xl">
              {r.title}
            </span>
          )}
          {r.note ? <span className="text-sm text-white/70 md:text-base">{r.note}</span> : null}
        </div>
      ))}
    </div>
  );
}

/** Small-caps label over a huge serif-italic numeral — the "(73)" look. */
export function CineStat({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("text-center text-white", className)}>
      <div className="text-[11px] uppercase tracking-[0.35em] text-white/80">{label}</div>
      <div className="mt-1 font-serif text-6xl italic leading-none md:text-7xl">({value})</div>
    </div>
  );
}

const hash = (i: number, salt: number): number => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (u: number) => u * u * (3 - 2 * u);

interface Plate {
  c: HTMLCanvasElement;
  w: number;
  h: number;
}

export const CineScroll = React.forwardRef<HTMLDivElement, CineScrollProps>(
  (
    {
      className,
      frames,
      video,
      chapters = [],
      height = "500vh",
      stageHeight = "100vh",
      blend = "exposure",
      motionBlur = 0.6,
      drift = 0,
      scrollSmoothing = 0.14,
      grade,
      style: styleProp,
      ...rest
    },
    ref,
  ) => {
    const vignette = grade?.vignette ?? 0.35;
    const grain = grade?.grain ?? 0.12;
    const framesKey = (frames ?? []).join("|");

    const trackRef = useRef<HTMLDivElement | null>(null);
    const stageRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const chapterRefs = useRef<(HTMLDivElement | null)[]>([]);
    const chaptersRef = useRef(chapters);
    chaptersRef.current = chapters;

    const plates = useRef<Plate[]>([]);
    const videoEl = useRef<HTMLVideoElement | null>(null);
    const [sourceVersion, setSourceVersion] = useState(0);
    const [reduced, setReduced] = useState(false);
    const [size, setSize] = useState({ w: 0, h: 0 });
    const vignetteRef = useRef<CanvasGradient | null>(null);
    const grainRef = useRef<CanvasPattern | null>(null);
    const visibleRef = useRef(false);

    /* stage size → canvas backing store (DPR ≤ 2) + cached vignette/grain */
    useEffect(() => {
      const el = stageRef.current;
      const canvas = canvasRef.current;
      if (!el || !canvas) return;
      const apply = () => {
        const r = el.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(Math.round(r.width), 2);
        const h = Math.max(Math.round(r.height), 2);
        setSize({ w, h });
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const g = ctx.createRadialGradient(
          w / 2, h / 2, Math.min(w, h) * 0.32,
          w / 2, h / 2, Math.hypot(w, h) * 0.62,
        );
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, `rgba(0,0,0,${vignette})`);
        vignetteRef.current = g;
        if (!grainRef.current) {
          const tile = document.createElement("canvas");
          tile.width = 96;
          tile.height = 96;
          const tctx = tile.getContext("2d");
          if (tctx) {
            const img = tctx.createImageData(96, 96);
            for (let i = 0; i < 96 * 96; i++) {
              const v = Math.round(hash(i, 3) * 255);
              img.data[i * 4] = v;
              img.data[i * 4 + 1] = v;
              img.data[i * 4 + 2] = v;
              img.data[i * 4 + 3] = 255;
            }
            tctx.putImageData(img, 0, 0);
            grainRef.current = ctx.createPattern(tile, "repeat");
          }
        }
      };
      apply();
      const ro = new ResizeObserver(apply);
      ro.observe(el);
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      const onMq = () => setReduced(mq.matches);
      onMq();
      mq.addEventListener("change", onMq);
      return () => {
        ro.disconnect();
        mq.removeEventListener("change", onMq);
      };
    }, [vignette]);

    /* load the media: a video clip (scrubbed by seeking) or the frame sequence */
    useEffect(() => {
      let cancelled = false;
      plates.current = [];
      videoEl.current = null;
      setSourceVersion((v) => v + 1);
      if (video) {
        const vid = document.createElement("video");
        vid.muted = true;
        vid.playsInline = true;
        vid.preload = "auto";
        vid.src = video;
        const ready = () => {
          if (cancelled) return;
          videoEl.current = vid;
          setSourceVersion((v) => v + 1);
        };
        vid.addEventListener("loadeddata", ready, { once: true });
        return () => {
          cancelled = true;
          vid.removeEventListener("loadeddata", ready);
          vid.removeAttribute("src");
          vid.load();
        };
      }
      const loaded: (Plate | null)[] = new Array((frames ?? []).length).fill(null);
      let done = 0;
      (frames ?? []).forEach((src, i) => {
        const img = new Image();
        img.onload = () => {
          if (cancelled) return;
          const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, 1));
          const c = document.createElement("canvas");
          c.width = Math.max(Math.round(img.naturalWidth * scale), 2);
          c.height = Math.max(Math.round(img.naturalHeight * scale), 2);
          const cctx = c.getContext("2d");
          if (cctx) cctx.drawImage(img, 0, 0, c.width, c.height);
          loaded[i] = { c, w: c.width, h: c.height };
          if (++done === (frames ?? []).length) {
            plates.current = loaded.filter(Boolean) as Plate[];
            setSourceVersion((v) => v + 1);
          }
        };
        img.src = src;
      });
      return () => {
        cancelled = true;
      };
      /* eslint-disable-next-line react-hooks/exhaustive-deps */
    }, [video ?? framesKey]);

    /* render + loop — parked when off-screen or hidden; direct scrub under reduced motion */
    useEffect(() => {
      const track = trackRef.current;
      const stage = stageRef.current;
      const canvas = canvasRef.current;
      if (!track || !stage || !canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const cw = size.w;
      const chh = size.h;

      const rawProgress = () => {
        const tr = track.getBoundingClientRect();
        const sr = stage.getBoundingClientRect();
        return clamp01(-tr.top / Math.max(tr.height - sr.height, 1));
      };

      const drawFit = (source: CanvasImageSource, sw: number, sh: number, u: number, alpha: number, salt: number) => {
        if (!source || sw < 2 || sh < 2 || cw < 4 || chh < 4) return;
        const zoom = (1 + drift) * (1 + drift * 1.5 * u);
        const s = Math.max(cw / sw, chh / sh) * zoom;
        const dw = sw * s;
        const dh = sh * s;
        const panX = (hash(salt, 1) * 2 - 1) * drift * cw * u;
        const panY = (hash(salt, 2) * 2 - 1) * drift * chh * u;
        ctx.globalAlpha = alpha;
        ctx.drawImage(source, (cw - dw) / 2 + panX, (chh - dh) / 2 + panY, dw, dh);
      };

      const drawPlate = (idx: number, u: number, alpha: number) => {
        const pl = plates.current[idx];
        if (pl) drawFit(pl.c, pl.w, pl.h, u, alpha, idx);
      };

      const draw = (p: number, blurPx: number) => {
        if (cw < 4 || chh < 4) return;
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, cw, chh);

        const vid = videoEl.current;
        if (vid && vid.readyState >= 2) {
          /* video mode: one continuous source, drift spans the whole clip */
          drawFit(vid, vid.videoWidth, vid.videoHeight, p, 1, 3);
          ctx.globalAlpha = 1;
        } else {
          const n = plates.current.length;
          if (n > 0) {
            const f = p * (n - 1);
            const i = Math.min(Math.floor(f), Math.max(n - 2, 0));
            const u = n > 1 ? clamp01(f - i) : 0;
            drawPlate(i, u, 1);
            if (i + 1 < n) {
              ctx.globalCompositeOperation = blend === "exposure" ? "lighten" : "source-over";
              drawPlate(i + 1, 0, smooth(u));
              ctx.globalCompositeOperation = "source-over";
            }
            ctx.globalAlpha = 1;
          }
        }

        /* whip blur — self-composited taps along the scroll axis */
        if (blurPx > 0.8) {
          const dir = blurPx >= 0 ? 1 : -1;
          const b = Math.min(Math.abs(blurPx), 48);
          for (let t = 1; t <= 4; t++) {
            ctx.globalAlpha = 0.22 / t;
            ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, (dir * b * t) / 4, cw, chh);
          }
          ctx.globalAlpha = 1;
        }

        if (vignetteRef.current) {
          ctx.fillStyle = vignetteRef.current;
          ctx.fillRect(0, 0, cw, chh);
        }
        if (grainRef.current && grain > 0) {
          const gx = Math.floor(hash(Math.floor(p * 512), 4) * 96);
          const gy = Math.floor(hash(Math.floor(p * 512), 5) * 96);
          ctx.save();
          ctx.globalCompositeOperation = "overlay";
          ctx.globalAlpha = grain;
          ctx.translate(-gx, -gy);
          ctx.fillStyle = grainRef.current;
          ctx.fillRect(0, 0, cw + 96, chh + 96);
          ctx.restore();
        }
      };

      const updateChapters = (p: number) => {
        chaptersRef.current.forEach((c, idx) => {
          const el = chapterRefs.current[idx];
          if (!el) return;
          const span = Math.max(c.to - c.from, 1e-4);
          const vis = clamp01((p - c.from) / span);
          const fade = 0.16;
          /* a chapter that starts with the film (from = 0) is already on screen */
          const aIn = c.from > 0 ? smooth(clamp01(vis / fade)) : 1;
          const a = aIn * smooth(clamp01((1 - vis) / fade));
          el.style.opacity = String(a);
          el.style.transform = `translateY(${(1 - a) * 24}px)`;
          el.style.pointerEvents = a < 0.1 ? "none" : "auto";
        });
      };

      let raf = 0;
      let running = false;
      let last = performance.now();
      let dp = -1;
      let prev = 0;

      const tick = (now: number) => {
        if (!running) return;
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        const p = rawProgress();
        if (dp < 0) {
          dp = p;
          prev = p;
        }
        const k = scrollSmoothing <= 0 ? 1 : 1 - Math.pow(1 - scrollSmoothing, dt * 60);
        dp += (p - dp) * k;
        /* video mode: scrub = seek (browser decodes async; we draw the latest frame) */
        const vid = videoEl.current;
        if (vid && vid.duration > 0 && !Number.isNaN(vid.duration)) {
          const target = clamp01(dp) * Math.max(vid.duration - 0.05, 0);
          if (Math.abs(vid.currentTime - target) > 0.033) vid.currentTime = target;
        }
        const v = dt > 0 ? (dp - prev) / dt : 0;
        prev = dp;
        draw(dp, Math.abs(v) * motionBlur * 90 * Math.sign(v));
        updateChapters(dp);
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

      /* direct manipulation: no loop, no smoothing, no blur — scroll swaps plates instantly */
      const renderNow = () => {
        const p = rawProgress();
        const vid = videoEl.current;
        if (vid && vid.duration > 0 && !Number.isNaN(vid.duration)) {
          const target = clamp01(p) * Math.max(vid.duration - 0.05, 0);
          if (Math.abs(vid.currentTime - target) > 0.033) vid.currentTime = target;
        }
        draw(p, 0);
        updateChapters(p);
      };
      const onScroll = () => renderNow();

      const io = new IntersectionObserver((entries) => {
        visibleRef.current = entries.some((e) => e.isIntersecting);
        if (reduced) return;
        if (visibleRef.current) start();
        else stop();
      });
      io.observe(track);

      const onVis = () => {
        if (reduced) return;
        if (document.hidden) stop();
        else if (visibleRef.current) start();
      };
      document.addEventListener("visibilitychange", onVis);

      if (reduced) {
        window.addEventListener("scroll", onScroll, { passive: true, capture: true });
        renderNow();
      } else {
        start();
      }
      return () => {
        stop();
        io.disconnect();
        document.removeEventListener("visibilitychange", onVis);
        window.removeEventListener("scroll", onScroll, true);
      };
    }, [
      size.w, size.h, sourceVersion, video, blend, motionBlur, drift, scrollSmoothing,
      grain, reduced,
    ]);

    const alignClass = (a: CineScrollChapter["align"]) =>
      a === "center" ? "justify-center text-center" : a === "right" ? "justify-end text-right" : "justify-start";
    const atClass = (a: CineScrollChapter["at"]) =>
      a === "top" ? "items-start pt-24" : a === "bottom" ? "items-end pb-24" : "items-center";

    return (
      <div
        ref={(el) => {
          trackRef.current = el;
          if (typeof ref === "function") ref(el);
          else if (ref) ref.current = el;
        }}
        className={cn("relative", className)}
        style={{ height, position: "relative", ...styleProp }}
        {...rest}
      >
        <div
          ref={stageRef}
          className="sticky top-0 w-full overflow-hidden bg-black"
          /* position/top inline: the host app's Tailwind scan may never have seen this file */
          style={{ height: stageHeight, position: "sticky", top: 0, overflow: "hidden" }}
        >
          <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-hidden="true" />
          {chapters.map((c, i) => (
            <div
              key={i}
              className={cn("pointer-events-none absolute inset-0 z-10 flex p-6 md:p-12", alignClass(c.align), atClass(c.at))}
            >
              <div
                ref={(el) => {
                  chapterRefs.current[i] = el;
                }}
                className={cn("max-w-xl opacity-0", c.className)}
              >
                {c.content}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  },
);
CineScroll.displayName = "CineScroll";
