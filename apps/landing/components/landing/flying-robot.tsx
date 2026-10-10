"use client";

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { useCalConfig } from "@/components/shared/cta-button";

const W = 112;
const H = Math.round((W * 570) / 420);
const MIN_VIEWPORT = 1024;
/** Width of the page content column (Tailwind max-w-6xl). */
const CONTENT_WIDTH = 1152;
/** Closest the robot gets to the top bar while beside a title. */
const TOP_LIMIT = 140;
/** Narrowest slice of the robot worth showing in a tight margin. */
const MIN_VISIBLE = 40;

/** A small guide that sits beside the current section title.
 *
 *  Any element with `data-robot="right" | "perch"` is a stop. The active stop
 *  is the last one whose top has passed 55% of the viewport. While its title
 *  is on screen the robot stays beside it; once the title scrolls up it
 *  steps into the empty margin next to the content column, so it never covers
 *  anything. In a margin that is too narrow it tucks partly or fully off the
 *  right edge. Decorative and desktop-only. A speech bubble shows the section's line while
 *  the robot is beside its title. */
export function FlyingRobot() {
  const reduce = useReducedMotion();
  const calConfig = useCalConfig();
  const x = useMotionValue(-400);
  const y = useMotionValue(-400);
  const sx = useSpring(x, { stiffness: 80, damping: 18, mass: 0.8 });
  const sy = useSpring(y, { stiffness: 80, damping: 18, mass: 0.8 });
  const [active, setActive] = useState(false);
  const [say, setSay] = useState<string | null>(null);
  const [parked, setParked] = useState(false);
  const placed = useRef(false);

  useEffect(() => {
    if (reduce) return;
    let raf = 0;

    const compute = () => {
      raf = 0;
      if (innerWidth < MIN_VIEWPORT) {
        setActive(false);
        return;
      }
      const stops = Array.from(
        document.querySelectorAll<HTMLElement>("[data-robot]"),
      );
      if (!stops.length) return;
      const focus = innerHeight * 0.55;
      let stop = stops[0]!;
      for (const s of stops) {
        if (s.getBoundingClientRect().top <= focus) stop = s;
        else break;
      }
      const r = stop.getBoundingClientRect();
      let tx: number;
      let ty: number;
      if (stop.dataset.robot === "perch") {
        tx = r.right - W - 24;
        ty = r.top - H + 36;
      } else {
        tx = r.right + 16;
        ty = r.top - 12;
      }
      ty = Math.min(ty, innerHeight - H - 24);

      const isParked = ty < TOP_LIMIT;
      if (isParked) {
        // Title has scrolled away: move into the margin beside the content.
        const columnRight = Math.min(
          (innerWidth + CONTENT_WIDTH) / 2,
          innerWidth - 24,
        );
        const gutter = innerWidth - columnRight;
        const visible = Math.min(W, gutter - 8);
        ty = Math.max(TOP_LIMIT, innerHeight * 0.55 - H / 2);
        tx =
          visible >= W
            ? columnRight + (gutter - W) / 2
            : visible >= MIN_VISIBLE
              ? innerWidth - visible
              : innerWidth + 20;
      } else {
        tx = Math.min(tx, innerWidth - W - 12);
      }

      if (!placed.current) {
        placed.current = true;
        sx.jump(tx);
        sy.jump(ty);
      }
      x.set(tx);
      y.set(ty);
      setActive(true);
      setParked(isParked);
      setSay(stop.dataset.robotSay ?? null);
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(compute);
    };
    compute();
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
    };
  }, [reduce, x, y, sx, sy]);

  if (reduce) return null;

  return (
    <>
      {/* Speech bubble: its own layer so the robot's blend does not touch it. */}
      <motion.div
        aria-hidden
        style={{ x: sx, y: sy, width: W, opacity: active ? 1 : 0 }}
        className="pointer-events-none fixed left-0 top-0 z-40 hidden lg:block"
      >
        <AnimatePresence mode="wait">
          {say && !parked ? (
            <motion.div
              key={say}
              initial={{ opacity: 0, y: 6, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.96 }}
              transition={{ duration: 0.3 }}
              className="absolute bottom-full right-0 mb-1 whitespace-nowrap rounded-2xl rounded-br-sm border border-white/15 bg-[#13112e]/90 px-3 py-1.5 text-xs text-slate-100 shadow-lg backdrop-blur"
            >
              {say}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>

      <motion.div
        aria-hidden={!active}
        style={{ x: sx, y: sy, width: W, opacity: active ? 1 : 0 }}
        className="fixed left-0 top-0 z-40 hidden mix-blend-screen lg:block"
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label="Book a discovery call"
          data-cal-namespace=""
          data-cal-link="webcules/discovery"
          data-cal-config={calConfig}
          className="group relative block w-full cursor-pointer"
        >
          <div className="float-slow relative transition-transform duration-300 group-hover:scale-110">
            <div className="absolute -bottom-2 left-1/2 h-8 w-16 -translate-x-1/2 rounded-full bg-violet-500/60 blur-2xl" />
            <Image
              src="/imgs/art/robot.webp"
              alt=""
              width={420}
              height={570}
              sizes="112px"
              className="relative [mask-image:radial-gradient(closest-side,black_72%,transparent)]"
            />
          </div>
        </button>
      </motion.div>
    </>
  );
}
