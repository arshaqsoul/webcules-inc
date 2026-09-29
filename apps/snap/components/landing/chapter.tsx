"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import type { Photo } from "./photos";
import { useMouseParallax } from "./mouse-parallax";

/**
 * Pinned scroll-stage: a tall section whose inner viewport sticks while
 * scrollYProgress drives everything inside. Chapters fade to black at their
 * end and hold it through the tail; the next chapter rises as black and its
 * opening frame fades up — a fade-through-black dissolve between scenes.
 */
export function Chapter({
  id,
  vh = 320,
  dipEnd = true,
  className,
  children,
}: {
  id?: string;
  /** Section length in viewport heights — the scroll budget of this scene. */
  vh?: number;
  /** Fade to black and hold it through the sliding-out tail. */
  dipEnd?: boolean;
  className?: string;
  children: (progress: MotionValue<number>) => ReactNode;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const dip = useTransform(scrollYProgress, [0.96, 1], [0, 1]);

  return (
    <section id={id} ref={ref} style={{ height: `${vh}vh` }} className="relative bg-[#0a0b0f]">
      <div className={`sticky top-0 h-[100svh] overflow-hidden ${className ?? "bg-[#0a0b0f]"}`}>
        {children(scrollYProgress)}
        {dipEnd ? (
          <motion.div
            aria-hidden
            style={{ opacity: dip, backgroundColor: "#0a0b0f" }}
            className="pointer-events-none absolute inset-0 z-40"
          />
        ) : null}
      </div>
    </section>
  );
}

/**
 * A full-bleed photograph active during [start, end] of the chapter's
 * progress. Crossfades in, pushes in slowly (the documentary zoom), and
 * optionally racks focus (blur → sharp) like a lens pull.
 */
export function PhotoLayer({
  photo,
  progress,
  start,
  end,
  push = 1.16,
  focusPull = false,
  fadeOut = true,
}: {
  photo: Photo;
  progress: MotionValue<number>;
  start: number;
  end: number;
  push?: number;
  focusPull?: boolean;
  fadeOut?: boolean;
}) {
  // Opening frames fade in slowly — that fade IS the cross-dissolve through
  // the seam while the previous chapter's sticky slides out beneath.
  const opacityInput = fadeOut
    ? start === 0
      ? [0, 0.09, Math.max(end - 0.06, 0.1), end]
      : [start - 0.06, start + 0.03, Math.max(end - 0.06, start + 0.04), end]
    : start === 0
      ? [0, 0.09, 1]
      : [start - 0.06, start + 0.03, 1];
  const opacity = useTransform(progress, opacityInput, fadeOut ? [0, 1, 1, 0] : [0, 1, 1]);
  const scale = useTransform(progress, [start, end], [1, push]);
  const blur = useTransform(
    progress,
    [start, start + (end - start) * 0.35],
    focusPull ? [14, 0] : [0, 0],
  );
  const filter = useMotionTemplate`blur(${blur}px) saturate(1.05)`;
  // the frame drifts a few px with the cursor — the scroll scale provides
  // the overflow headroom so no edge ever shows
  const { x: mouseX, y: mouseY } = useMouseParallax(10);

  return (
    <motion.div style={{ opacity }} className="absolute inset-0">
      <motion.img
        src={photo.src}
        alt={photo.alt}
        loading={start === 0 ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
        style={{ scale, filter, x: mouseX, y: mouseY, objectPosition: photo.position ?? "center" }}
        className="h-full w-full select-none object-cover will-change-transform"
      />
    </motion.div>
  );
}

/** Which slice of progress is active — drives HUD counters and captions. */
export function useFrameIndex(progress: MotionValue<number>, count: number, from = 0, to = 1) {
  const [index, setIndex] = useState(0);
  useMotionValueEvent(progress, "change", (v) => {
    const clamped = Math.min(Math.max((v - from) / (to - from), 0), 0.999);
    const next = Math.floor(clamped * count);
    if (next !== index) setIndex(next);
  });
  return index;
}

/** Viewfinder chrome: corner brackets, a focus box that re-locks per frame, EXIF line. */
export function Viewfinder({
  progress,
  exif,
  count,
  from = 0,
  to = 1,
  tint = "white",
}: {
  progress: MotionValue<number>;
  exif: string[];
  count?: number;
  from?: number;
  to?: number;
  tint?: "white" | "ink";
}) {
  const total = count ?? exif.length;
  const index = useFrameIndex(progress, total, from, to);
  const c = tint === "white" ? "text-white/75" : "text-ink/70";
  const border = tint === "white" ? "border-white/40" : "border-ink/30";
  // the center reticle aims with the cursor
  const { x: aimX, y: aimY } = useMouseParallax(80);

  return (
    <>
      {/* corner brackets */}
      <div aria-hidden className={`pointer-events-none absolute inset-6 z-30 sm:inset-10 ${c}`}>
        <span className={`absolute left-0 top-0 h-6 w-6 rounded-tl-sm border-l-2 border-t-2 ${border}`} />
        <span className={`absolute right-0 top-0 h-6 w-6 rounded-tr-sm border-r-2 border-t-2 ${border}`} />
        <span className={`absolute bottom-0 left-0 h-6 w-6 rounded-bl-sm border-b-2 border-l-2 ${border}`} />
        <span className={`absolute bottom-0 right-0 h-6 w-6 rounded-br-sm border-b-2 border-r-2 ${border}`} />
      </div>

      {/* EXIF, top right — below the floating nav on small screens */}
      <div
        className={`pointer-events-none absolute right-4 top-[74px] z-30 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] sm:right-10 sm:top-10 sm:text-[11px] ${c}`}
      >
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500/90" />
        {exif[Math.min(index, exif.length - 1)]}
      </div>

      {/* frame counter, bottom right */}
      <div
        className={`pointer-events-none absolute bottom-8 right-8 z-30 font-mono text-[10px] uppercase tracking-[0.22em] sm:bottom-10 sm:right-10 sm:text-[11px] ${c}`}
      >
        {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </div>

      {/* center reticle — aims with the cursor; re-locks on every frame change */}
      <motion.div
        aria-hidden
        style={{ x: aimX, y: aimY }}
        className={`pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 ${c}`}
      >
        <motion.div
          animate={{ opacity: [0.3, 0.55, 0.3] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          className="h-20 w-20 rounded-sm border border-current sm:h-24 sm:w-24"
        />
        <motion.div
          key={index}
          initial={{ opacity: 0.9, scale: 1.5 }}
          animate={{ opacity: 0, scale: 1 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className={`absolute inset-0 rounded-sm border-2 ${border}`}
        />
      </motion.div>
    </>
  );
}

/** Chapter title block, bottom-left, crossfades through a list of captions. */
export function ChapterTitles({
  progress,
  windows,
  className,
}: {
  progress: MotionValue<number>;
  windows: { start: number; end: number; node: ReactNode }[];
  className?: string;
}) {
  return (
    // Explicit width: absolutely-positioned children don't give this root a
    // shrink-to-fit width, and the captions would wrap one word per line.
    <div className={`pointer-events-none absolute z-30 w-[min(88vw,40rem)] ${className ?? "bottom-24 left-6 sm:bottom-28 sm:left-12"}`}>
      {windows.map((w, i) => (
        <CaptionWindow key={i} progress={progress} start={w.start} end={w.end}>
          {w.node}
        </CaptionWindow>
      ))}
    </div>
  );
}

function CaptionWindow({
  progress,
  start,
  end,
  children,
}: {
  progress: MotionValue<number>;
  start: number;
  end: number;
  children: ReactNode;
}) {
  const opacity = useTransform(progress, [start, start + 0.05, end - 0.05, end], [0, 1, 1, 0]);
  const y = useTransform(progress, [start, start + 0.05], [26, 0]);
  return (
    <motion.div style={{ opacity, y }} className="absolute bottom-0 left-0 w-full max-w-xl">
      {children}
    </motion.div>
  );
}
