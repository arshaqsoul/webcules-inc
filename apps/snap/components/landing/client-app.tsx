"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Download, Heart, Palette, Smartphone } from "lucide-react";

import { PhoneInteractive } from "./phone-demo";
import { FadeUp } from "./text-reveal";

const POINTS = [
  { icon: Smartphone, title: "A photo app, not a link", body: "Clients install your gallery to their home screen. Their photos, one tap away, forever." },
  { icon: Heart, title: "Favorites you can see", body: "Every heart lands on your side in real time - with notes, lists and exports for album design." },
  { icon: Download, title: "Downloads on your terms", body: "One-click Download all for every client, PIN-protect downloads, offer web-size or full resolution, or require your approval first." },
  { icon: Palette, title: "Entirely your brand", body: "Your logo, accent color and domain. On Studio and above, Snap disappears completely." },
];

/** The play-with-it section: a real, tappable client gallery next to a live studio notification. */
export function ClientApp() {
  const [count, setCount] = useState(1);
  return (
    <section className="relative overflow-hidden border-y border-hairline bg-surface-1 py-20 sm:py-32">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:gap-20">
        <FadeUp className="mx-auto w-[min(270px,72vw)] lg:order-2 lg:mx-0 lg:justify-self-center">
          <PhoneInteractive onCount={setCount} />
        </FadeUp>

        <div className="lg:order-1">
          <FadeUp>
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-tertiary sm:text-[11px]">The client experience</p>
            <h2 className="snap-display mt-3 text-balance text-4xl leading-[1.04] text-ink sm:text-6xl">
              Go on. <em className="italic">Tap a photo.</em>
            </h2>
            <p className="mt-4 max-w-lg text-pretty text-[15px] leading-relaxed text-ink-subtle">
              That is exactly what your clients get: a private, branded gallery that feels like an app. Every favorite
              reaches you the moment they make it.
            </p>
          </FadeUp>

          <FadeUp delay={0.08}>
            <div className="mt-7 flex items-center gap-3 rounded-xl border border-hairline bg-background p-3.5 shadow-sm">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-white">
                <Bell className="h-4 w-4" />
              </span>
              <div className="min-w-0 text-sm">
                <div className="font-medium text-ink">Maya &amp; Jon are choosing favorites</div>
                <div className="text-[13px] text-ink-subtle">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={count}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.25 }}
                      className="inline-block font-semibold tabular-nums text-ink"
                    >
                      {count}
                    </motion.span>
                  </AnimatePresence>{" "}
                  {count === 1 ? "photo" : "photos"} in their favorites
                </div>
              </div>
            </div>
          </FadeUp>

          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {POINTS.map((p, i) => (
              <FadeUp key={p.title} delay={0.1 + i * 0.05}>
                <div className="flex gap-3">
                  <p.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <div className="text-sm font-semibold text-ink">{p.title}</div>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink-subtle">{p.body}</p>
                  </div>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
