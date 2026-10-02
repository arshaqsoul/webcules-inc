"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { ArrowRight, Check } from "lucide-react";

import { useMouseParallax } from "./mouse-parallax";
import { PhoneAuto } from "./phone-demo";
import { HeroShowcase } from "./hero-showcase";

const PROOF = ["0% commission", "20 GB free", "No credit card"];

/**
 * Product-first hero: the headline, then the product already running -
 * a laptop playing the pipeline and a client's phone hearting photos, both
 * floating over a blurred frame of the work and tilting toward the cursor.
 */
export function Hero({ signedIn }: { signedIn: boolean }) {
  const ref = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const bgY = useTransform(scrollYProgress, [0, 1], ["0%", "18%"]);
  const stageY = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const { x: mx, y: my } = useMouseParallax(14);
  const phoneX = useTransform(mx, (v) => v * -1.4);
  const phoneY = useTransform(my, (v) => v * -1.4);

  return (
    <section
      ref={ref}
      aria-label="Snap - the studio platform for photographers"
      className="relative overflow-hidden bg-[#0a0b0f] pb-20 pt-32 text-white sm:pb-28 sm:pt-40"
    >
      <motion.img
        src="/imgs/landing/scenery-peak.jpg"
        alt=""
        aria-hidden
        fetchPriority="high"
        draggable={false}
        style={{ y: bgY }}
        className="absolute inset-0 h-[115%] w-full select-none object-cover opacity-[0.28]"
      />
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_30%,rgb(94,106,210,0.28),transparent_70%)]" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-[#0a0b0f]/40 via-transparent to-[#0a0b0f]" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.24em] text-white/75 backdrop-blur-md"
          >
            The studio platform for photographers
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="snap-display mt-6 text-balance text-[54px] leading-[0.98] sm:text-[88px]"
          >
            Your studio, <em className="italic text-white/90">in focus.</em>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.32 }}
            className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-white/70 sm:text-lg"
          >
            Booking, pipeline, contracts, galleries clients actually love, and payouts straight to your own Stripe.
            One login, one calm place to run the whole business - so you can stay behind the lens.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.44 }}
            className="mt-9 flex flex-wrap items-center justify-center gap-3"
          >
            <Link
              href={signedIn ? "/dashboard" : "/signup"}
              className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-[#12141c] shadow-[0_10px_40px_-10px_rgb(255,255,255,0.45)] transition-transform hover:scale-[1.03] active:scale-[0.99]"
            >
              {signedIn ? "Open your studio" : "Create your studio - free"}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#tour"
              className="rounded-full border border-white/20 bg-white/[0.06] px-7 py-3.5 text-sm font-medium text-white backdrop-blur-md transition-colors hover:bg-white/15"
            >
              Watch it work
            </a>
          </motion.div>
          <motion.ul
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.7 }}
            className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-[12px] text-white/55"
          >
            {PROOF.map((p) => (
              <li key={p} className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-[#8b95ff]" strokeWidth={2.5} /> {p}
              </li>
            ))}
          </motion.ul>
        </div>

        {/* device stage */}
        <motion.div
          style={{ y: stageY }}
          initial={{ opacity: 0, y: 70, rotateX: 14 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ duration: 1.3, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="relative mx-auto mt-14 max-w-5xl [perspective:1800px] sm:mt-20"
        >
          <motion.div style={{ x: mx, y: my }}>
            <HeroShowcase />
          </motion.div>
          <motion.div
            style={{ x: phoneX, y: phoneY }}
            className="absolute bottom-[30px] right-[-7%] z-10 hidden w-[15%] max-w-[170px] sm:block"
          >
            <PhoneAuto />
          </motion.div>
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-10 left-1/2 h-24 w-[70%] -translate-x-1/2 rounded-[100%] bg-primary/30 blur-3xl"
          />
        </motion.div>
      </div>
    </section>
  );
}
