"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";

import { HERO_FRAMES } from "./photos";
import { useMouseParallax } from "./mouse-parallax";

const CAPTIONS = [
  { title: "It starts with light.", exif: "ƒ/11 · 1/250 · ISO 64" },
  { title: "Then a place.", exif: "ƒ/8 · 1/320 · ISO 100" },
  { title: "Then something wild.", exif: "ƒ/4 · 1/1000 · ISO 400" },
  { title: "Then a moment no one else saw.", exif: "ƒ/1.4 · 1/2000 · ISO 1600" },
];

/** The hero "tape": 12 seconds at 24fps, burned through by scrolling. */
const TAPE_SECONDS = 12;
const TAPE_FPS = 24;

function timecodeAt(progress: number): string {
  const total = Math.round(Math.min(Math.max(progress, 0), 1) * TAPE_SECONDS * TAPE_FPS);
  const f = total % TAPE_FPS;
  const s = Math.floor(total / TAPE_FPS) % 60;
  const m = Math.floor(total / (TAPE_FPS * 60));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `00:${pad(m)}:${pad(s)}:${pad(f)}`;
}

/**
 * The one-shot sell. Four landscapes stack into a single dive, framed as
 * found camcorder footage: a REC timecode burns through the tape as you
 * scroll, a crosshair hunts focus, and each scene gets a chapter-sized line.
 */
export function HeroDive({ signedIn }: { signedIn: boolean }) {
  const ref = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  // Fade the last frame to black and hold — the crawl act begins from darkness.
  const dip = useTransform(scrollYProgress, [0.955, 1], [0, 1]);

  return (
    <section ref={ref} aria-label="Snap — the studio platform for photographers" className="relative h-[380vh] bg-[#0a0b0f]">
      <div className="sticky top-0 h-[100svh] overflow-hidden bg-[#0a0b0f]">
        {HERO_FRAMES.map((photo, i) => (
          <DiveFrame
            key={photo.src}
            photo={photo}
            index={i}
            total={HERO_FRAMES.length}
            progress={scrollYProgress}
          />
        ))}

        {/* legibility scrims */}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/10 to-black/55" />

        <HeroHeadline progress={scrollYProgress} signedIn={signedIn} />
        <HeroCaptions progress={scrollYProgress} />
        <CamcorderHud progress={scrollYProgress} />
        <ScrollCue progress={scrollYProgress} />

        <motion.div
          aria-hidden
          style={{ opacity: dip }}
          className="pointer-events-none absolute inset-0 z-40 bg-[#0a0b0f]"
        />
      </div>
    </section>
  );
}

function DiveFrame({
  photo,
  index,
  total,
  progress,
}: {
  photo: (typeof HERO_FRAMES)[number];
  index: number;
  total: number;
  progress: MotionValue<number>;
}) {
  const slice = 1 / total;
  const start = index * slice;
  const end = start + slice;
  const first = index === 0;
  const last = index === total - 1;

  // First frame is already on screen; last frame holds until the cut.
  // Windows are wide enough that neighbouring frames visibly dissolve.
  const opacity = useTransform(
    progress,
    first
      ? [0, end - 0.045, end]
      : last
        ? [start - 0.05, start + 0.035, 1]
        : [start - 0.05, start + 0.035, end - 0.045, end],
    first ? [1, 1, 0] : last ? [0, 1, 1] : [0, 1, 1, 0],
  );
  const scale = useTransform(progress, [start, end], first ? [1.06, 1.34] : [1.12, 1.4]);
  const { x: mouseX, y: mouseY } = useMouseParallax(12);

  return (
    <motion.div style={{ opacity }} className="absolute inset-0">
      <motion.img
        src={photo.src}
        alt={index === 0 ? photo.alt : ""}
        aria-hidden={index > 0}
        loading={first ? "eager" : "lazy"}
        {...(first ? { fetchPriority: "high" as const } : {})}
        decoding="async"
        draggable={false}
        style={{ scale, x: mouseX, y: mouseY }}
        className="h-full w-full select-none object-cover will-change-transform"
      />
    </motion.div>
  );
}

function HeroHeadline({ progress, signedIn }: { progress: MotionValue<number>; signedIn: boolean }) {
  const opacity = useTransform(progress, [0.005, 0.11], [1, 0]);
  const y = useTransform(progress, [0, 0.11], [0, -70]);
  const blur = useTransform(progress, [0.02, 0.11], [0, 8]);
  const filter = useTransform(blur, (b) => `blur(${b}px)`);
  const scale = useTransform(progress, [0, 0.11], [1, 0.96]);

  return (
    <motion.div
      style={{ opacity, y, filter, scale }}
      className="pointer-events-none absolute inset-x-0 top-[19svh] z-30 flex flex-col items-center px-6 text-center sm:top-[24svh]"
    >
      <motion.span
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-auto mb-6 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.28em] text-white/90 backdrop-blur-md sm:text-[11px]"
      >
        Snap · for photographers
      </motion.span>

      <motion.h1
        initial={{ opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.1, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="snap-display max-w-5xl text-balance text-[13.5vw] leading-[0.98] text-white sm:text-[9vw] lg:text-[104px]"
      >
        Your studio, <em className="italic">in focus.</em>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.68, ease: [0.16, 1, 0.3, 1] }}
        className="mt-6 max-w-xl text-pretty text-[15px] leading-relaxed text-white/85 sm:text-lg"
      >
        Snap runs the business of photography — booking, pipelines, vault-grade galleries,
        and payments that pay you, not us. One login, so you can stay behind the lens.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, delay: 0.84, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-auto mt-8 flex flex-wrap items-center justify-center gap-3"
      >
        <Link
          href={signedIn ? "/dashboard" : "/signup"}
          className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#12141c] shadow-[0_10px_40px_rgb(0,0,0,0.35)] transition-transform hover:scale-[1.03] active:scale-[0.99]"
        >
          {signedIn ? "Open your studio" : "Create your studio — free"}
        </Link>
        <a
          href="#story"
          className="rounded-full border border-white/30 bg-white/5 px-6 py-3 text-sm font-medium text-white backdrop-blur-md transition-colors hover:bg-white/15"
        >
          Scroll the story ↓
        </a>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1.15 }}
        className="mt-5 font-mono text-[10px] uppercase tracking-[0.22em] text-white/60 sm:text-[11px]"
      >
        0% commission · 20 GB free · unlimited gallery views
      </motion.p>
    </motion.div>
  );
}

/** Chapter-sized serif captions — same voice as the story chapters. */
function HeroCaptions({ progress }: { progress: MotionValue<number> }) {
  return (
    <div className="pointer-events-none absolute bottom-24 left-6 z-30 w-[min(88vw,44rem)] sm:bottom-28 sm:left-12">
      {CAPTIONS.map((caption, i) => (
        <CaptionBlock key={caption.title} progress={progress} at={i * 0.25 + 0.02} caption={caption} />
      ))}
    </div>
  );
}

function CaptionBlock({
  progress,
  at,
  caption,
}: {
  progress: MotionValue<number>;
  at: number;
  caption: (typeof CAPTIONS)[number];
}) {
  const opacity = useTransform(progress, [at, at + 0.045, at + 0.21, at + 0.25], [0, 1, 1, 0]);
  const y = useTransform(progress, [at, at + 0.045], [26, 0]);
  return (
    <motion.div style={{ opacity, y }} className="absolute bottom-0 left-0 w-full">
      <h2 className="snap-display text-4xl leading-[1.04] text-white sm:text-6xl">{caption.title}</h2>
      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.24em] text-white/75 sm:text-[11px]">
        {caption.exif}
      </p>
    </motion.div>
  );
}

/**
 * Camcorder chrome: REC + timecode burning through the tape with scroll,
 * a focus crosshair that hunts once the headline clears, tape date,
 * and the deck mode. This is the desktop filler that makes the dive
 * feel like found footage.
 */
function CamcorderHud({ progress }: { progress: MotionValue<number> }) {
  const [timecode, setTimecode] = useState("00:00:00:00");
  const [date, setDate] = useState("");

  useMotionValueEvent(progress, "change", (v) => setTimecode(timecodeAt(v)));

  useEffect(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    setDate(`${now.getFullYear()}·${pad(now.getMonth() + 1)}·${pad(now.getDate())}`);
  }, []);

  const crosshairOpacity = useTransform(progress, [0.1, 0.2], [0, 0.55]);
  const { x: aimX, y: aimY } = useMouseParallax(85);

  return (
    <>
      {/* REC + tape counter, top left — below the floating nav on mobile */}
      <div className="pointer-events-none absolute left-4 top-[74px] z-30 flex items-center gap-3 sm:left-10 sm:top-[92px] sm:gap-4">
        <span className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
          <span className="font-mono text-xs font-semibold uppercase tracking-[0.3em] text-white sm:text-sm">
            Rec
          </span>
        </span>
        <span className="font-mono text-base font-medium tabular-nums tracking-[0.14em] text-white sm:text-2xl">
          {timecode}
        </span>
      </div>

      {/* deck mode, top right — below the nav on mobile */}
      <div className="pointer-events-none absolute right-4 top-[76px] z-30 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-white/70 sm:right-10 sm:top-[96px] sm:text-[11px]">
        <span>AF</span>
        <span className="text-white/35">·</span>
        <span>4K 24p</span>
      </div>

      {/* focus crosshair — arrives once the headline has left, aims with the cursor */}
      <motion.div
        style={{ opacity: crosshairOpacity, x: aimX, y: aimY }}
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2"
      >
        <motion.svg
          viewBox="0 0 64 64"
          className="h-12 w-12 text-white sm:h-16 sm:w-16"
          animate={{ scale: [1, 1.07, 1] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          fill="none"
        >
          <circle cx="32" cy="32" r="21" stroke="currentColor" strokeWidth="1.5" opacity="0.85" />
          <path d="M32 4v14M32 46v14M4 32h14M46 32h14" stroke="currentColor" strokeWidth="1.5" />
        </motion.svg>
      </motion.div>

      {/* tape date, bottom right */}
      <div className="pointer-events-none absolute bottom-10 right-6 z-30 font-mono text-[10px] uppercase tracking-[0.24em] text-white/70 sm:bottom-12 sm:right-12 sm:text-[11px]">
        {date}
      </div>
    </>
  );
}

function ScrollCue({ progress }: { progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [0, 0.03], [1, 0]);
  return (
    <motion.div
      style={{ opacity }}
      aria-hidden
      className="absolute bottom-10 left-1/2 z-30 -translate-x-1/2 sm:bottom-12"
    >
      <div className="flex h-10 w-6 items-start justify-center rounded-full border border-white/40 p-1.5">
        <motion.span
          animate={{ y: [0, 12, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          className="h-2 w-1 rounded-full bg-white/80"
        />
      </div>
    </motion.div>
  );
}
