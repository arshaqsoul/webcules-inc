"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

/**
 * The opening crawl. Pure black, a hint of starfield, gold text tilted away
 * on a perspective plane that scrolls upward through the viewport — the
 * classic episode handoff between the hero dive and Chapter One.
 */
export function CrawlChapter() {
  const ref = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });

  // Same unit (svh) on both keyframes so framer can interpolate numerically.
  // Travel ends just past the text height so the block is on screen for most
  // of the pin and exits near the section end, not a third of the way in.
  const y = useTransform(scrollYProgress, [0.08, 0.9], ["78svh", "-142svh"]);
  const introOpacity = useTransform(scrollYProgress, [0, 0.055, 0.13], [1, 1, 0]);
  const introY = useTransform(scrollYProgress, [0, 0.13], [0, -40]);
  const crawlOpacity = useTransform(scrollYProgress, [0.035, 0.09], [0, 1]);

  return (
    <section ref={ref} aria-label="The story of Snap" className="relative h-[260vh] bg-[#040407]">
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        {/* faint starfield */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "radial-gradient(1px 1px at 18% 24%, rgba(255,255,255,0.65) 50%, transparent 51%)," +
              "radial-gradient(1.5px 1.5px at 68% 58%, rgba(255,255,255,0.45) 50%, transparent 51%)," +
              "radial-gradient(1px 1px at 42% 78%, rgba(255,255,255,0.55) 50%, transparent 51%)," +
              "radial-gradient(1px 1px at 86% 12%, rgba(255,255,255,0.4) 50%, transparent 51%)," +
              "radial-gradient(1px 1px at 8% 64%, rgba(255,255,255,0.4) 50%, transparent 51%)," +
              "radial-gradient(1.5px 1.5px at 55% 34%, rgba(255,255,255,0.35) 50%, transparent 51%)",
            backgroundSize: "620px 620px, 840px 840px, 520px 520px, 900px 900px, 700px 700px, 760px 760px",
          }}
        />

        {/* the blue opener */}
        <motion.p
          style={{ opacity: introOpacity, y: introY }}
          className="absolute inset-x-0 top-[40svh] z-10 px-6 text-center font-mono text-[13px] uppercase tracking-[0.3em] text-[#8fd8f0] sm:text-base"
        >
          A long time ago in a studio far, far away<span className="tracking-normal">….</span>
        </motion.p>

        {/* the crawl: perspective plane, tilted away at the top */}
        <motion.div style={{ opacity: crawlOpacity }} className="absolute inset-0 z-10">
          <div className="absolute inset-x-0 bottom-[-6%] top-[22svh] mx-auto max-w-3xl px-6 [perspective:420px] sm:inset-x-10">
            <div className="h-full [transform:rotateX(20deg)] [transform-origin:50%_100%]">
              <motion.div
                style={{ y }}
                className="flex flex-col items-center gap-9 text-center will-change-transform sm:gap-12"
              >
                <p className="font-mono text-sm uppercase tracking-[0.5em] text-white/85 sm:text-lg">
                  Episode I
                </p>
                <h2 className="snap-display text-5xl leading-tight text-white sm:text-7xl">
                  The Business of <em className="italic">Light</em>
                </h2>
                <div className="space-y-9 text-xl font-semibold leading-relaxed text-white/90 sm:text-2xl sm:leading-relaxed">
                  <p>
                    It is a time of scattered software. Bookings live in one app, galleries
                    in another, contracts in a third — and every sale pays a commission to a
                    platform that never held a camera.
                  </p>
                  <p>
                    Working photographers, keepers of the last honest light, spend their
                    nights on admin while their best frames sit undelivered….
                  </p>
                  <p>
                    Until now. <span className="font-bold text-white">One login</span> runs
                    the whole studio — booking, pipeline, vault-grade galleries, contracts,
                    and payouts straight to your own Stripe. Zero commission. Forever.
                  </p>
                  <p className="font-bold text-white">
                    Snap — the studio platform for photographers. This is where the story
                    begins….
                  </p>
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* distance fades — text dissolves into the dark at the vanishing point */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[42svh] bg-gradient-to-b from-[#040407] via-[#040407]/72 to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[10svh] bg-gradient-to-t from-[#040407] to-transparent"
        />
      </div>
    </section>
  );
}
